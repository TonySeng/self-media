'use client';

import { useEffect, useState } from 'react';

function relative(d: string | null): string {
  if (!d) return '从未同步';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return '刚刚同步';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} 分钟前同步`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)} 小时前同步`;
  return `${Math.floor(ms / 86400_000)} 天前同步`;
}

export function SyncStatusChip() {
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/platforms/health').then(async (r) => {
      if (!r.ok || !alive) return;
      const j = (await r.json()) as { lastSyncAt: string | null };
      setLast(j.lastSyncAt);
    });
    return () => {
      alive = false;
    };
  }, []);
  return <div className="px-2 text-xs text-muted-foreground">{relative(last)}</div>;
}
