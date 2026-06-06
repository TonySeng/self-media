'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

type Account = {
  id: string;
  platform: string;
  nickname: string;
  avatar: string | null;
};

export function AccountSelector() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const selectedId = searchParams.get('accountId') || '';

  useEffect(() => {
    fetch('/api/platforms/douyin/accounts')
      .then((r) => r.json())
      .then((data: Account[]) => setAccounts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleChange(accountId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (accountId) {
      params.set('accountId', accountId);
    } else {
      params.delete('accountId');
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  if (loading || accounts.length === 0) return null;

  const selected = accounts.find((a) => a.id === selectedId);

  return (
    <div className="mb-4 px-1">
      <label className="mb-1.5 block px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        当前账号
      </label>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {selected?.avatar && (
          <img
            src={selected.avatar}
            alt=""
            className="pointer-events-none absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full object-cover"
          />
        )}
        <select
          className={[
            'w-full appearance-none rounded-md border border-input bg-background py-2 pr-8 text-sm transition-colors hover:border-ring/40 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20',
            selected?.avatar ? 'pl-9' : 'pl-3',
          ].join(' ')}
          value={selectedId}
          onChange={(e) => handleChange(e.target.value)}
        >
          <option value="">全部账号</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.nickname}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}
