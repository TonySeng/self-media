'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AccountSelector } from '@/components/layout/account-selector';
import { SyncStatusChip } from '@/components/platforms/sync-status-chip';

type NavItem = { href: string; label: string; icon: React.ReactNode };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: '数据',
    items: [
      { href: '/dashboard', label: '仪表盘', icon: <IconDashboard /> },
      { href: '/works', label: '作品', icon: <IconVideo /> },
      { href: '/benchmark-accounts', label: '对标账号', icon: <IconUsers /> },
    ],
  },
  {
    title: '创作',
    items: [
      { href: '/materials', label: '素材库', icon: <IconLibrary /> },
    ],
  },
  {
    title: 'AI 助手',
    items: [
      { href: '/ai/chat', label: '对话', icon: <IconChat /> },
      { href: '/ai/topic-suggest', label: '选题', icon: <IconLightbulb /> },
      { href: '/ai/copy-optimize', label: '文案', icon: <IconPen /> },
      { href: '/ai/works-compare', label: '对比', icon: <IconCompare /> },
      { href: '/ai/trend', label: '趋势', icon: <IconTrend /> },
      { href: '/ai/benchmark', label: '对标', icon: <IconTarget /> },
      { href: '/ai/history', label: '历史', icon: <IconHistory /> },
    ],
  },
  {
    title: '系统',
    items: [
      { href: '/settings', label: '设置', icon: <IconSettings /> },
    ],
  },
];

function SidebarInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId');

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <IconLogo />
        </div>
        <div className="text-base font-semibold tracking-tight">Self-Media</div>
      </div>
      <AccountSelector />
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {NAV.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              const href = accountId ? `${item.href}?accountId=${accountId}` : item.href;
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={[
                    'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  ].join(' ')}
                >
                  <span className={active ? 'text-primary-foreground' : 'text-muted-foreground/70 group-hover:text-foreground'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-2 space-y-1 border-t pt-3">
        <SyncStatusChip />
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <IconLogout />
          <span>退出登录</span>
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-card/50 p-3 backdrop-blur">
      <Suspense fallback={null}>
        <SidebarInner />
      </Suspense>
    </aside>
  );
}

// --- Icons (16px stroke) ---

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconLogo() {
  return (
    <svg {...ICON_PROPS} width={18} height={18}>
      <path d="M5 3v18l7-3 7 3V3z" />
    </svg>
  );
}
function IconDashboard() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconVideo() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconLibrary() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 3h7v7H3z" />
      <path d="M14 3h7v7h-7z" />
      <path d="M3 14h7v7H3z" />
      <circle cx="17.5" cy="17.5" r="3.5" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconLightbulb() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.5.5.7 1.2.7 1.9V18h6.6v-1.4c0-.7.2-1.4.7-1.9A7 7 0 0 0 12 2z" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}
function IconCompare() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3v18" />
      <path d="m8 7-4 4 4 4" />
      <path d="m16 17 4-4-4-4" />
    </svg>
  );
}
function IconTrend() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function IconHistory() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
