'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

  useEffect(() => {
    const t = setTimeout(async () => {
      const url = new URL('/api/works', window.location.origin);
      if (q) url.searchParams.set('q', q);
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as { items: Item[] };
        setItems(j.items);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">作品</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="搜索标题"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-60"
          />
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
        </div>
      </div>

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
              className={`overflow-hidden p-0 transition-colors ${
                selectMode
                  ? selected
                    ? 'border-primary ring-2 ring-primary'
                    : 'hover:border-primary/50 cursor-pointer'
                  : 'hover:border-primary cursor-pointer'
              }`}
            >
              <div className="aspect-video bg-muted relative">
                {it.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {selectMode && selected && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    ✓
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3">
                <div className="line-clamp-2 text-sm font-medium">{it.title}</div>
                <div className="text-xs text-muted-foreground">
                  {it.account.nickname} ·{' '}
                  {new Date(it.publishedAt).toLocaleDateString()}
                </div>
                {it.latestMetric && (
                  <div className="text-xs text-muted-foreground">
                    播 {it.latestMetric.play.toLocaleString()} · 赞{' '}
                    {it.latestMetric.like} · 评 {it.latestMetric.comment}
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
