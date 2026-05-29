'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

type Account = {
  id: string;
  nickname: string;
  avatar: string | null;
  cookieStatus: 'ACTIVE' | 'EXPIRED' | 'INVALID';
  lastSyncAt: string | null;
  lastError: string | null;
};

export default function PlatformsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cookie, setCookie] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/platforms/douyin/accounts');
    if (res.ok) setAccounts(((await res.json()) as Account[]));
  }

  useEffect(() => { void load(); }, []);

  async function add() {
    if (!cookie.trim()) return;
    setAdding(true);
    const res = await fetch('/api/platforms/douyin/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cookie }),
    });
    setAdding(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(j.message ?? '添加失败');
      return;
    }
    toast.success('账号已添加');
    setCookie('');
    await load();
  }

  async function sync(id: string) {
    setSyncingId(id);
    const res = await fetch(`/api/sync/run/${id}`, { method: 'POST' });
    setSyncingId(null);
    if (!res.ok) {
      toast.error('同步失败');
      return;
    }
    toast.success('同步完成');
    await load();
  }

  async function remove(id: string) {
    if (!confirm('确认删除该账号？相关作品数据也会一并删除。')) return;
    const res = await fetch(`/api/platforms/douyin/accounts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('已删除');
      await load();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">平台账号</h1>

      <Card className="space-y-3 p-4">
        <Label>添加抖音账号（粘贴 Cookie 字符串）</Label>
        <textarea
          className="h-24 w-full rounded-md border px-3 py-2 font-mono text-xs"
          placeholder="sessionid_ss=...; ttwid=...; ..."
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
        />
        <Button onClick={add} disabled={adding}>
          {adding ? '校验中…' : '添加'}
        </Button>
      </Card>

      <div className="space-y-3">
        {accounts.map((a) => (
          <Card key={a.id} className="flex items-center gap-4 p-4">
            <img src={a.avatar ?? '/avatar-fallback.svg'} alt="" className="h-10 w-10 rounded-full" />
            <div className="flex-1">
              <div className="font-medium">{a.nickname}</div>
              <div className="text-xs text-muted-foreground">
                状态：<StatusBadge s={a.cookieStatus} /> · 最近同步：
                {a.lastSyncAt ? new Date(a.lastSyncAt).toLocaleString() : '从未'}
              </div>
              {a.lastError && (
                <div className="mt-1 text-xs text-red-500">最近错误：{a.lastError}</div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void sync(a.id)}
              disabled={syncingId === a.id}
            >
              {syncingId === a.id ? '同步中…' : '立即同步'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void remove(a.id)}>
              删除
            </Button>
          </Card>
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有账号，先在上方添加一个吧。</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: Account['cookieStatus'] }) {
  const cls =
    s === 'ACTIVE' ? 'text-green-600'
      : s === 'EXPIRED' ? 'text-orange-500'
      : 'text-red-500';
  const text = s === 'ACTIVE' ? '正常' : s === 'EXPIRED' ? '已失效' : '无效';
  return <span className={cls}>{text}</span>;
}
