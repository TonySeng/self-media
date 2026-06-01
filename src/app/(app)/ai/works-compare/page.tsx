'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/ai/markdown';
import { parseSSEStream } from '@/lib/sse';
import { toast } from 'sonner';

type Work = {
  id: string;
  title: string;
  coverUrl: string | null;
  publishedAt: string;
  account: { id: string; nickname: string };
  latestMetric: { play: number; like: number; comment: number } | null;
};

export default function WorksComparePage() {
  const [works, setWorks] = useState<Work[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const url = new URL('/api/works', window.location.origin);
      if (searchQuery) url.searchParams.set('q', searchQuery);
      url.searchParams.set('limit', '100');
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as { items: Work[] };
        setWorks(j.items);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  function toggleSelect(workId: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(workId)) {
      newSet.delete(workId);
    } else {
      if (newSet.size >= 10) {
        toast.error('最多对比 10 个作品');
        return;
      }
      newSet.add(workId);
    }
    setSelectedIds(newSet);
  }

  async function handleCompare() {
    if (selectedIds.size < 2) {
      toast.error('请至少选择 2 个作品');
      return;
    }

    // 检查是否同一账号
    const selectedWorks = works.filter((w) => selectedIds.has(w.id));
    const accountIds = new Set(selectedWorks.map((w) => w.account.id));
    if (accountIds.size > 1) {
      toast.error('请选择同一账号下的作品');
      return;
    }

    setAnalyzing(true);
    setResult('');

    try {
      const res = await fetch('/api/ai/works-compare/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workIds: Array.from(selectedIds) }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '分析失败');
      }

      type Event =
        | { type: 'text'; delta: string }
        | { type: 'finish'; result: string }
        | { type: 'error'; message: string };

      let fullText = '';
      for await (const event of parseSSEStream<Event>(res.body)) {
        if (event.type === 'text') {
          fullText += event.delta;
          setResult(fullText);
        } else if (event.type === 'finish') {
          setResult(event.result);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
      toast.success('对比分析完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '分析失败');
      setResult(null);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI 横向对比</h1>
        <div className="flex items-center gap-3">
          <Input
            placeholder="搜索作品标题"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-60"
          />
          <Button
            onClick={handleCompare}
            disabled={analyzing || selectedIds.size < 2}
          >
            {analyzing ? '分析中...' : `对比分析 (${selectedIds.size})`}
          </Button>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        选择 2-10 个同账号下的作品进行 AI 横向对比，分析数据差异和共性规律
      </div>

      {result && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">AI 对比分析结果</h2>
          <div className="rounded-md bg-muted p-3">
            <Markdown>{result}</Markdown>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {works.map((work) => {
          const selected = selectedIds.has(work.id);
          return (
            <Card
              key={work.id}
              onClick={() => toggleSelect(work.id)}
              className={`cursor-pointer overflow-hidden p-0 transition-all ${
                selected
                  ? 'border-primary ring-2 ring-primary'
                  : 'hover:border-primary/50'
              }`}
            >
              <div className="aspect-video bg-muted relative">
                {work.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={work.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                {selected && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    ✓
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3">
                <div className="line-clamp-2 text-sm font-medium">
                  {work.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {work.account.nickname} ·{' '}
                  {new Date(work.publishedAt).toLocaleDateString()}
                </div>
                {work.latestMetric && (
                  <div className="text-xs text-muted-foreground">
                    播 {work.latestMetric.play.toLocaleString()} · 赞{' '}
                    {work.latestMetric.like} · 评 {work.latestMetric.comment}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {works.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            暂无作品。绑定账号并同步后会显示在这里。
          </p>
        )}
      </div>
    </div>
  );
}
