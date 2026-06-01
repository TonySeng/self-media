import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';
import { streamAnalysisTask, type StreamAnalysisChunk } from './stream';

const TOP_N = 50;

async function prepareCommentInsightPrompt(workId: string): Promise<{
  systemPrompt: string;
  userPrompt: string;
  totalCount: number;
  analyzedCount: number;
}> {
  const work = await db.work.findUnique({ where: { id: workId } });
  if (!work) throw new Error('Work not found');

  const comments = await db.workComment.findMany({
    where: { workId },
    orderBy: { likeCount: 'desc' },
    take: TOP_N,
  });

  if (comments.length === 0) {
    throw new Error(
      'No comments found for this work. Please sync comments first.',
    );
  }

  const totalCount = await db.workComment.count({ where: { workId } });

  const commentsList = comments
    .map((c, i) => `${i + 1}. [${c.likeCount} 赞] ${c.authorName}：${c.content}`)
    .join('\n');

  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'COMMENT_INSIGHT' },
  });

  const template = customTemplate || DEFAULT_PROMPTS.COMMENT_INSIGHT;

  const vars = {
    workTitle: work.title,
    commentsCount: String(totalCount),
    topN: String(comments.length),
    commentsList,
  };

  return {
    systemPrompt: template.systemPrompt,
    userPrompt: fillTemplate(template.userTemplate, vars),
    totalCount,
    analyzedCount: comments.length,
  };
}

export async function executeCommentInsight(workId: string) {
  const { systemPrompt, userPrompt, totalCount, analyzedCount } =
    await prepareCommentInsightPrompt(workId);

  const client = await getDefaultLLMClient();
  const result = await client.generate({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxOutputTokens: 2000,
  });

  const analysis = await db.aIAnalysis.create({
    data: {
      type: 'COMMENT_INSIGHT',
      targetRefs: { workId, commentsCount: totalCount, analyzedCount },
      prompt: userPrompt,
      response: result.text,
      modelUsed: client.config.defaultModel,
      llmProviderId: client.providerId,
      tokensUsed: {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      },
      status: 'DONE',
    },
  });

  return {
    analysisId: analysis.id,
    result: result.text,
    tokensUsed: {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
    },
  };
}

export async function* streamCommentInsight(
  workId: string,
): AsyncIterable<StreamAnalysisChunk> {
  const { systemPrompt, userPrompt, totalCount, analyzedCount } =
    await prepareCommentInsightPrompt(workId);

  yield* streamAnalysisTask({
    type: 'COMMENT_INSIGHT',
    systemPrompt,
    userPrompt,
    targetRefs: { workId, commentsCount: totalCount, analyzedCount },
    maxOutputTokens: 2000,
  });
}
