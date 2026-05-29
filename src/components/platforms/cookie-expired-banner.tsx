'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function CookieExpiredBanner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/platforms/health');
        if (!res.ok) return;
        const j = (await res.json()) as { expiredCount: number };
        if (alive) setCount(j.expiredCount);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (count <= 0) return null;
  return (
    <div className="border-b bg-red-50 px-4 py-2 text-sm text-red-800">
      有 {count} 个账号 Cookie 已失效。
      <Link href="/settings/platforms" className="ml-2 underline">
        前往重新导入
      </Link>
    </div>
  );
}
