'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/stat-card';
import { FansTrendChart } from '@/components/dashboard/fans-trend-chart';
import { WorkPerformanceChart } from '@/components/dashboard/work-performance-chart';
import { TopWorksList } from '@/components/dashboard/top-works-list';
import { PageHeader } from '@/components/layout/page-header';

type DashboardData = {
  stats: {
    totalWorks: number;
    totalPlays: number;
    totalEngagement: number;
    recentWorks: number;
    avgPlay: number;
    avgEngagement: number;
  };
  fansTrend: Array<{ date: string; fans: number }>;
  workPerformance: Array<{ date: string; play: number; like: number; comment: number }>;
  topWorks: Array<{
    id: string;
    title: string;
    coverUrl: string | null;
    play: number;
    like: number;
    comment: number;
    publishedAt: string;
  }>;
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">加载中...</p>}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId') || '';

  useEffect(() => {
    const url = accountId ? `/api/dashboard?accountId=${accountId}` : '/api/dashboard';
    fetch(url)
      .then((r) => r.json())
      .then((d: DashboardData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [accountId]);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">加载中...</p>;
  }

  if (!data) {
    return <p className="p-6 text-sm text-red-500">加载失败</p>;
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="数据总览" description="账号粉丝、作品和互动数据" />

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="总作品数"
          value={data.stats.totalWorks}
          subtitle={`近 30 天：${data.stats.recentWorks} 个`}
          accent="blue"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="14" height="12" rx="2" />
              <path d="m22 8-6 4 6 4z" />
            </svg>
          }
        />
        <StatCard
          label="总播放量"
          value={data.stats.totalPlays.toLocaleString()}
          subtitle={`近 30 天平均：${data.stats.avgPlay.toLocaleString()}`}
          accent="emerald"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          }
        />
        <StatCard
          label="总互动数"
          value={data.stats.totalEngagement.toLocaleString()}
          subtitle={`近 30 天平均：${data.stats.avgEngagement.toLocaleString()}`}
          accent="rose"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          }
        />
      </div>

      {/* 粉丝趋势 */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">粉丝趋势</h2>
          <span className="text-xs text-muted-foreground">近 30 天</span>
        </div>
        <FansTrendChart data={data.fansTrend} />
      </Card>

      {/* 作品表现 */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">作品表现</h2>
          <span className="text-xs text-muted-foreground">近 30 天</span>
        </div>
        <WorkPerformanceChart data={data.workPerformance} />
      </Card>

      {/* Top 5 作品 */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">热门作品</h2>
          <span className="text-xs text-muted-foreground">Top 5</span>
        </div>
        <TopWorksList
          works={data.topWorks.map((w) => ({
            ...w,
            publishedAt: new Date(w.publishedAt),
          }))}
        />
      </Card>
    </div>
  );
}
