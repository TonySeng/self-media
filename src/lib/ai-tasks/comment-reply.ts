import { db } from '@/lib/db';
import { getDefaultLLMClient } from '@/lib/llm/registry';
import { DEFAULT_PROMPTS, fillTemplate } from '@/lib/llm/default-prompts';

async function preparePrompt(commentId: string): Promise<{
  systemPrompt: string;
  userPrompt: string;
  workId: string;
}> {
  const comment = await db.workComment.findUnique({
    where: { id: commentId },
    include: { work: true },
  });
  if (!comment) throw new Error('comment not found');

  const customTemplate = await db.promptTemplate.findFirst({
    where: { type: 'COMMENT_REPLY' },
  });
  const template = customTemplate || DEFAULT_PROMPTS.COMMENT_REPLY;

  const userPrompt = fillTemplate(template.userTemplate, {
    workTitle: comment.work.title || '(无标题)',
    workDesc: comment.work.description || '(无描述)',
    authorName: comment.authorName,
    commentContent: comment.content,
  });

  return {
    systemPrompt: template.systemPrompt,
    userPrompt,
    workId: comment.workId,
  };
}

export async function executeCommentReply(commentId: string): Promise<{
  analysisId: string;
  result: string;
  tokensUsed: { input: number; output: number };
}> {
  const { systemPrompt, userPrompt, workId } = await preparePrompt(commentId);

  const client = await getDefaultLLMClient();
  const result = await client.generate({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxOutputTokens: 200,
  });

  const analysis = await db.aIAnalysis.create({
    data: {
      type: 'COMMENT_REPLY',
      targetRefs: { commentId, workId },
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
    result: result.text.trim(),
    tokensUsed: {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
    },
  };
}
