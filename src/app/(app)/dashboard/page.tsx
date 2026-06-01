'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/stat-card';
import { FansTrendChart } from '@/components/dashboard/fans-trend-chart';
import { WorkPerformanceChart } from '@/components/dashboard/work-performance-chart';
import { TopWorksList } from '@/components/dashboard/top-works-list';

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
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d: DashboardData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">加载中...</p>;
  }

  if (!data) {
    return <p className="p-6 text-sm text-red-500">加载失败</p>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">数据总览</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="总作品数"
          value={data.stats.totalWorks}
          subtitle={`近 30 天：${data.stats.recentWorks} 个`}
        />
        <StatCard
          label="总播放量"
          value={data.stats.totalPlays.toLocaleString()}
          subtitle={`近 30 天平均：${data.stats.avgPlay.toLocaleString()}`}
        />
        <StatCard
          label="总互动数"
          value={data.stats.totalEngagement.toLocaleString()}
          subtitle={`近 30 天平均：${data.stats.avgEngagement.toLocaleString()}`}
        />
      </div>

      {/* 粉丝趋势 */}
      <Card className="p-4">
        <h2 className="mb-4 text-sm font-medium">粉丝趋势（近 30 天）</h2>
        <FansTrendChart data={data.fansTrend} />
      </Card>

      {/* 作品表现 */}
      <Card className="p-4">
        <h2 className="mb-4 text-sm font-medium">作品表现（近 30 天）</h2>
        <WorkPerformanceChart data={data.workPerformance} />
      </Card>

      {/* Top 5 作品 */}
      <Card className="p-4">
        <h2 className="mb-4 text-sm font-medium">Top 5 热门作品</h2>
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
