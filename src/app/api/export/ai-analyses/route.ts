import { db } from '@/lib/db';
import { AIAnalysisType } from '@prisma/client';
import { csvResponse, toCsv } from '@/lib/csv';

const TYPE_LABELS: Record<AIAnalysisType, string> = {
  WORK_REVIEW: '单作品复盘',
  TOPIC_SUGGEST: '选题建议',
  COPY_OPTIMIZE: '文案优化',
  WORKS_COMPARE: '横向对比',
  TREND: '趋势分析',
  COMMENT_INSIGHT: '评论洞察',
  COMMENT_REPLY: '评论回复',
  BENCHMARK: '对标分析',
};

/**
 * GET /api/export/ai-analyses?type=xxx
 * 导出 AI 分析记录
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as AIAnalysisType | null;

  const analyses = await db.aIAnalysis.findMany({
    where: type ? { type } : {},
    include: { provider: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const rows = analyses.map((a) => {
    const tokens = a.tokensUsed as { input?: number; output?: number } | null;
    return {
      type: TYPE_LABELS[a.type] || a.type,
      status: a.status,
      provider: a.provider?.name || '',
      modelUsed: a.modelUsed,
      inputTokens: tokens?.input ?? '',
      outputTokens: tokens?.output ?? '',
      response: a.response ?? '',
      error: a.error ?? '',
      createdAt: a.createdAt.toISOString(),
    };
  });

  const csv = toCsv(rows, [
    { key: 'type', label: '类型' },
    { key: 'status', label: '状态' },
    { key: 'provider', label: 'Provider' },
    { key: 'modelUsed', label: '模型' },
    { key: 'inputTokens', label: '输入Token' },
    { key: 'outputTokens', label: '输出Token' },
    { key: 'response', label: '响应' },
    { key: 'error', label: '错误' },
    { key: 'createdAt', label: '创建时间' },
  ]);

  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(csv, `ai-analyses-${date}.csv`);
}
