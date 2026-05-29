'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { Card } from '@/components/ui/card';
import { MetricTrendChart } from '@/components/works/metric-trend-chart';

type Detail = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  publishedAt: string;
  account: { nickname: string };
  metrics: Array<{
    snapshotAt: string;
    play: number;
    like: number;
    comment: number;
    share: number;
    collect: number;
    finishRate: number | null;
  }>;
};

export default function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/works/${id}`);
      if (!res.ok) {
        setError('作品不存在');
        return;
      }
      setData((await res.json()) as Detail);
    })().catch((e: unknown) => setError(String(e)));
  }, [id]);

  if (error) return <p className="p-6 text-sm text-red-500">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">加载中…</p>;

  const latest = data.metrics[data.metrics.length - 1];

  return (
    <div className="space-y-6 p-6">
      <div className="flex gap-4">
        {data.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.coverUrl} alt="" className="h-40 w-72 rounded-lg object-cover" />
        )}
        <div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <p className="text-xs text-muted-foreground">
            {data.account.nickname} · 发布于 {new Date(data.publishedAt).toLocaleString()}
          </p>
          {data.description && (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{data.description}</p>
          )}
        </div>
      </div>

      {latest && (
        <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
          <Stat label="播放" value={latest.play} />
          <Stat label="点赞" value={latest.like} />
          <Stat label="评论" value={latest.comment} />
          <Stat label="分享" value={latest.share} />
          <Stat label="收藏" value={latest.collect} />
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">数据趋势</h2>
        {data.metrics.length > 0 ? (
          <MetricTrendChart data={data.metrics} />
        ) : (
          <p className="text-sm text-muted-foreground">暂无快照数据。</p>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}
