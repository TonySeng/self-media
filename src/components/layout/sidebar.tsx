'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/dashboard', label: '仪表盘' },
  { href: '/works', label: '作品' },
  { href: '/materials', label: '素材库' },
  { href: '/ai-chat', label: 'AI 对话' },
  { href: '/ai-history', label: 'AI 历史' },
  { href: '/settings', label: '设置' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-muted/30 p-4">
      <div className="mb-6 px-2 text-lg font-semibold">Self-Media</div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Button variant="ghost" size="sm" className="mt-2" onClick={logout}>
        退出登录
      </Button>
    </aside>
  );
}
