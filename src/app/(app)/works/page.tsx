'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/page-header';
import { parseSSEStream } from '@/lib/sse';
import { toast } from 'sonner';

type Item = {
  id: string;
  title: string;
  coverUrl: string | null;
  publishedAt: string;
  account: { id: string; nickname: string };
  latestMetric: { play: number; like: number; comment: number } | null;
};

export default function WorksPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">加载中...</p>}>
      <WorksInner />
    </Suspense>
  );
}

function WorksInner() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    done: number;
    failed: number;
    current: string | null;
  } | null>(null);
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId') || '';

  useEffect(() => {
    const t = setTimeout(async () => {
      const url = new URL('/api/works', window.location.origin);
      if (q) url.searchParams.set('q', q);
      if (accountId) url.searchParams.set('accountId', accountId);
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as { items: Item[] };
        setItems(j.items);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, accountId]);

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function runBulkReview() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `将对 ${ids.length} 个作品依次执行 AI 复盘，预计耗时 ${ids.length * 15}-${ids.length * 60} 秒。是否继续？`,
      )
    ) {
      return;
    }

    setBulkRunning(true);
    setBulkProgress({
      total: ids.length,
      done: 0,
      failed: 0,
      current: null,
    });

    let done = 0;
    let failed = 0;

    for (const id of ids) {
      const work = items.find((i) => i.id === id);
      setBulkProgress({
        total: ids.length,
        done,
        failed,
        current: work?.title || id,
      });

      try {
        const res = await fetch('/api/ai/work-review/stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workId: id }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        // 消耗整个流（不更新 UI 的 result，最终在历史里查看）
        type Event =
          | { type: 'text' }
          | { type: 'finish' }
          | { type: 'error'; message: string };
        for await (const event of parseSSEStream<Event>(res.body)) {
          if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
        done++;
      } catch (e) {
        failed++;
        console.error(`Bulk review failed for work ${id}:`, e);
      }
      setBulkProgress({
        total: ids.length,
        done,
        failed,
        current: null,
      });
    }

    setBulkRunning(false);
    toast.success(
      `批量复盘完成：成功 ${done} 个 / 失败 ${failed} 个。详细结果可在 AI 历史查看。`,
      { duration: 8000 },
    );
    setBulkProgress(null);
    exitSelectMode();
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="作品"
        description={`共 ${items.length} 个作品`}
        actions={
          <>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <Input
                placeholder="搜索标题"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-60 pl-9"
              />
            </div>
            {!selectMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectMode(true)}
                >
                  批量分析
                </Button>
                <a href="/api/export/works" download>
                  <Button variant="outline" size="sm">
                    导出 CSV
                  </Button>
                </a>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">
                  已选 {selectedIds.size}
                </span>
                <Button
                  size="sm"
                  onClick={runBulkReview}
                  disabled={bulkRunning || selectedIds.size === 0}
                >
                  {bulkRunning ? '执行中...' : '批量 AI 复盘'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={exitSelectMode}
                  disabled={bulkRunning}
                >
                  取消
                </Button>
              </>
            )}
          </>
        }
      />

      {bulkProgress && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>
              进度：{bulkProgress.done + bulkProgress.failed} / {bulkProgress.total}
            </span>
            <span className="text-xs text-muted-foreground">
              成功 {bulkProgress.done} · 失败 {bulkProgress.failed}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${
                  ((bulkProgress.done + bulkProgress.failed) /
                    bulkProgress.total) *
                  100
                }%`,
              }}
            />
          </div>
          {bulkProgress.current && (
            <p className="mt-2 truncate text-xs text-muted-foreground">
              正在分析：{bulkProgress.current}
            </p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((it) => {
          const selected = selectedIds.has(it.id);
          const card = (
            <Card
              className={`group overflow-hidden p-0 transition-all ${
                selectMode
                  ? selected
                    ? 'border-primary ring-2 ring-primary/50 shadow-md'
                    : 'cursor-pointer hover:border-primary/40 hover:shadow-sm'
                  : 'cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
              }`}
            >
              <div className="relative aspect-video overflow-hidden bg-muted">
                {it.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.coverUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="6" width="14" height="12" rx="2" />
                      <path d="m22 8-6 4 6 4z" />
                    </svg>
                  </div>
                )}
                {selectMode && selected && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground shadow-md">
                    ✓
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <div className="text-xs text-white/90 drop-shadow">
                    {new Date(it.publishedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="space-y-2 p-3">
                <div className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">
                  {it.title}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="truncate">{it.account.nickname}</span>
                </div>
                {it.latestMetric && (
                  <div className="grid grid-cols-3 gap-2 border-t pt-2 text-xs">
                    <Stat icon="play" value={it.latestMetric.play} />
                    <Stat icon="like" value={it.latestMetric.like} />
                    <Stat icon="comment" value={it.latestMetric.comment} />
                  </div>
                )}
              </div>
            </Card>
          );

          if (selectMode) {
            return (
              <div
                key={it.id}
                onClick={() => !bulkRunning && toggleSelect(it.id)}
              >
                {card}
              </div>
            );
          }
          return (
            <Link key={it.id} href={`/works/${it.id}`}>
              {card}
            </Link>
          );
        })}
        {items.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            暂无作品。绑定账号并同步后会显示在这里。
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value }: { icon: 'play' | 'like' | 'comment'; value: number }) {
  const formatted = value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value.toLocaleString();
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <StatIcon icon={icon} />
      <span className="tabular-nums">{formatted}</span>
    </div>
  );
}

function StatIcon({ icon }: { icon: 'play' | 'like' | 'comment' }) {
  const props = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (icon === 'play') {
    return (
      <svg {...props}>
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    );
  }
  if (icon === 'like') {
    return (
      <svg {...props}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
