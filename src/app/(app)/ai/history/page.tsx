'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AIAnalysisType } from '@prisma/client';

type Analysis = {
  id: string;
  type: AIAnalysisType;
  targetRefs: Record<string, unknown>;
  status: string;
  modelUsed: string;
  providerName: string | null;
  tokensUsed: { input: number; output: number };
  error: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<AIAnalysisType, string> = {
  WORK_REVIEW: '单作品复盘',
  TOPIC_SUGGEST: '选题建议',
  COPY_OPTIMIZE: '文案优化',
  WORKS_COMPARE: '横向对比',
  TREND: '趋势分析',
  COMMENT_INSIGHT: '评论洞察',
  COMMENT_REPLY: '评论回复',
  BENCHMARK: '对标分析',
  COPY_BATCH_GEN: 'AI 批量生成',
};

export default function AIHistoryPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai/analyses')
      .then((r) => r.json())
      .then((data: { items: Analysis[] }) => {
        setAnalyses(data.items);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">加载中...</p>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI 分析历史</h1>
        <a href="/api/export/ai-analyses" download>
          <Button variant="outline" size="sm">
            导出 CSV
          </Button>
        </a>
      </div>

      <div className="space-y-3">
        {analyses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无分析记录。使用 AI 功能后会显示在这里。
          </p>
        ) : (
          analyses.map((analysis) => (
            <Link key={analysis.id} href={`/ai/history/${analysis.id}`}>
              <Card className="p-4 transition-colors hover:border-primary">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {TYPE_LABELS[analysis.type]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          analysis.status === 'DONE'
                            ? 'bg-green-100 text-green-700'
                            : analysis.status === 'FAILED'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {analysis.status === 'DONE'
                          ? '完成'
                          : analysis.status === 'FAILED'
                            ? '失败'
                            : '运行中'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(analysis.createdAt).toLocaleString()} ·{' '}
                      {analysis.providerName || analysis.modelUsed} ·{' '}
                      {analysis.tokensUsed.input + analysis.tokensUsed.output} tokens
                    </div>
                    {analysis.error && (
                      <div className="mt-2 text-xs text-red-500">
                        错误：{analysis.error}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
