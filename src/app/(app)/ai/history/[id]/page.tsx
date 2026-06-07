'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ai/markdown';
import { AIAnalysisType } from '@prisma/client';

type AnalysisDetail = {
  id: string;
  type: AIAnalysisType;
  targetRefs: Record<string, unknown>;
  prompt: string;
  response: string;
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

export default function AIHistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<AnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ai/analyses/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('分析记录不存在');
        return r.json();
      })
      .then((d: AnalysisDetail) => setData(d))
      .catch((e: unknown) => setError(String(e)));
  }, [id]);

  if (error) {
    return <p className="p-6 text-sm text-red-500">{error}</p>;
  }

  if (!data) {
    return <p className="p-6 text-sm text-muted-foreground">加载中...</p>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{TYPE_LABELS[data.type]}</h1>
        <Link href="/ai/history">
          <Button variant="outline" size="sm">
            返回列表
          </Button>
        </Link>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">状态：</span>
            <span
              className={`ml-2 ${
                data.status === 'DONE'
                  ? 'text-green-600'
                  : data.status === 'FAILED'
                    ? 'text-red-600'
                    : 'text-yellow-600'
              }`}
            >
              {data.status === 'DONE'
                ? '完成'
                : data.status === 'FAILED'
                  ? '失败'
                  : '运行中'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">时间：</span>
            <span className="ml-2">{new Date(data.createdAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">模型：</span>
            <span className="ml-2">
              {data.providerName ? `${data.providerName} / ` : ''}
              {data.modelUsed}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Token 消耗：</span>
            <span className="ml-2">
              输入 {data.tokensUsed.input} + 输出 {data.tokensUsed.output} ={' '}
              {data.tokensUsed.input + data.tokensUsed.output}
            </span>
          </div>
        </div>

        {data.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
            错误：{data.error}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">AI 响应</h2>
        <div className="rounded-md bg-muted p-3">
          <Markdown>{data.response}</Markdown>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">Prompt</h2>
        <div className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">
          {data.prompt}
        </div>
      </Card>

      {Object.keys(data.targetRefs).length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">目标引用</h2>
          <pre className="rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(data.targetRefs, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
