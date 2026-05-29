'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">作品</h1>
        <Input
          placeholder="搜索标题"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-60"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((it) => (
          <Link key={it.id} href={`/works/${it.id}`}>
            <Card className="overflow-hidden p-0 transition-colors hover:border-primary">
              <div className="aspect-video bg-muted">
                {it.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="space-y-1 p-3">
                <div className="line-clamp-2 text-sm font-medium">{it.title}</div>
                <div className="text-xs text-muted-foreground">
                  {it.account.nickname} · {new Date(it.publishedAt).toLocaleDateString()}
                </div>
                {it.latestMetric && (
                  <div className="text-xs text-muted-foreground">
                    播 {it.latestMetric.play.toLocaleString()} · 赞 {it.latestMetric.like} · 评 {it.latestMetric.comment}
                  </div>
                )}
              </div>
            </Card>
          </Link>
        ))}
        {items.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">暂无作品。绑定账号并同步后会显示在这里。</p>
        )}
      </div>
    </div>
  );
}
