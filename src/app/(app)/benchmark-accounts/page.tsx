'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Account = {
  id: string;
  platform: string;
  nickname: string;
  url: string | null;
  niche: string | null;
  followers: number | null;
  notes: string | null;
  worksCount: number;
  createdAt: string;
};

type OwnAccount = { id: string; nickname: string };

export default function BenchmarkAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [maxPages, setMaxPages] = useState('50');
  const [cookieFromAccountId, setCookieFromAccountId] = useState<string>('');
  const [fullSync, setFullSync] = useState(false);
  const [ownAccounts, setOwnAccounts] = useState<OwnAccount[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [form, setForm] = useState({
    nickname: '',
    url: '',
    niche: '',
    followers: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch('/api/benchmark-accounts');
    if (res.ok) {
      const j = (await res.json()) as { items: Account[] };
      setAccounts(j.items);
    }
  }

  useEffect(() => {
    void load();
    fetch('/api/platforms/douyin/accounts')
      .then((r) => r.json())
      .then((data: OwnAccount[]) => setOwnAccounts(data))
      .catch(() => {});
  }, []);

  async function handleImport() {
    if (!importInput.trim()) {
      toast.error('请输入主页链接或 sec_uid');
      return;
    }
    setImportLoading(true);
    try {
      const res = await fetch('/api/benchmark-accounts/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: importInput.trim(),
          syncWorks: true,
          maxPages: Number(maxPages) || 50,
          cookieFromAccountId: cookieFromAccountId || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '导入失败');
      }
      const data = await res.json();
      const stats = data.syncStats;
      toast.success(
        `${data.created ? '已导入对标账号' : '已更新对标账号'}` +
          (stats
            ? ` · 拉取 ${stats.fetched} 条作品 (新 ${stats.newCount} / 更 ${stats.updated})`
            : ''),
        { duration: 6000 },
      );
      setImporting(false);
      setImportInput('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImportLoading(false);
    }
  }

  async function handleSyncAccount(id: string) {
    const t = toast.loading(fullSync ? '全量同步中（较慢）...' : '同步中...');
    try {
      const res = await fetch(`/api/benchmark-accounts/${id}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cookieFromAccountId: cookieFromAccountId || null,
          // 全量同步翻满 maxPages 页；增量只拉到上次同步时间为止
          incremental: !fullSync,
          maxPages: Number(maxPages) || 50,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '同步失败');
      }
      const stats = await res.json();
      toast.success(
        `同步完成：拉取 ${stats.fetched} 条 (新 ${stats.newCount} / 更 ${stats.updated})`,
        { id: t },
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同步失败', { id: t });
    }
  }

  async function handleCreate() {
    if (!form.nickname.trim()) {
      toast.error('请填写账号昵称');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/benchmark-accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nickname: form.nickname.trim(),
          url: form.url.trim() || undefined,
          niche: form.niche.trim() || undefined,
          followers: form.followers ? Number(form.followers) : undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '创建失败');
      }
      toast.success('对标账号已添加');
      setAdding(false);
      setForm({ nickname: '', url: '', niche: '', followers: '', notes: '' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除该对标账号？相关录入的作品也会被一并删除。')) return;
    const res = await fetch(`/api/benchmark-accounts/${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      toast.success('已删除');
      await load();
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">对标账号</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setImporting(!importing);
              setAdding(false);
            }}
            disabled={importing}
            variant="outline"
          >
            从抖音导入
          </Button>
          <Button
            onClick={() => {
              setAdding(!adding);
              setImporting(false);
            }}
            disabled={adding}
          >
            手动添加
          </Button>
        </div>
      </div>

      {ownAccounts.length > 0 && (importing || accounts.length > 0) && (
        <Card className="space-y-2 p-4">
          <Label>用哪个本机账号的 Cookie 抓取（可选）</Label>
          <select
            value={cookieFromAccountId}
            onChange={(e) => setCookieFromAccountId(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">不使用 Cookie（部分账号可能拒绝访问）</option>
            {ownAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            借用本机已绑定抖音账号的 Cookie 去访问对标账号公开主页，命中率更高
          </p>

          <label className="flex items-center gap-2 pt-1 text-sm">
            <input
              type="checkbox"
              checked={fullSync}
              onChange={(e) => setFullSync(e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <span>全量同步（翻满设定页数，拉取全部历史作品）</span>
          </label>
          <p className="text-xs text-muted-foreground">
            点「同步作品」时生效。默认增量（只拉上次同步后的新作品，更快）；
            勾选后做全量，会翻满下方页数、耗时更长，首次同步或想补全历史数据时用。
          </p>

          <div className="space-y-1.5 pt-1">
            <Label>同步页数（每页 18 条）</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              全量同步时最多翻这么多页。默认 50 页（约 900 条）
            </p>
          </div>
        </Card>
      )}

      {importing && (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">从抖音导入对标账号</h2>
          <div className="space-y-1.5">
            <Label>对标账号主页链接 / sec_uid *</Label>
            <Input
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              placeholder="https://www.douyin.com/user/MS4wLjABAAAA... 或直接粘贴 sec_uid"
            />
            <p className="text-xs text-muted-foreground">
              在抖音网页端打开对标账号主页，复制地址栏 URL；系统会自动提取 sec_uid 并拉取信息+作品
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>同步页数（每页 18 条）</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              默认 50 页（约 900 条）。作品多就调大，作品少建议 5-10 页节省时间
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importLoading}>
              {importLoading ? '导入中...' : '导入'}
            </Button>
            <Button variant="ghost" onClick={() => setImporting(false)}>
              取消
            </Button>
          </div>
        </Card>
      )}

      {adding && (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">新建对标账号</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>账号昵称 *</Label>
              <Input
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                placeholder="例如：XX美食博主"
              />
            </div>
            <div className="space-y-1.5">
              <Label>主页链接</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://www.douyin.com/user/..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>账号定位</Label>
              <Input
                value={form.niche}
                onChange={(e) => setForm({ ...form, niche: e.target.value })}
                placeholder="例如：美食探店、宠物日常"
              />
            </div>
            <div className="space-y-1.5">
              <Label>粉丝数</Label>
              <Input
                type="number"
                value={form.followers}
                onChange={(e) => setForm({ ...form, followers: e.target.value })}
                placeholder="100000"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>备注</Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="运营观察、内容特色、值得学习的点..."
              className="h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有对标账号。点击右上角添加。
          </p>
        ) : (
          accounts.map((acc) => (
            <Card key={acc.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/benchmark-accounts/${acc.id}`}
                      className="font-medium hover:underline"
                    >
                      {acc.nickname}
                    </Link>
                    {acc.niche && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {acc.niche}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {acc.followers != null && (
                      <span>粉丝 {acc.followers.toLocaleString()} · </span>
                    )}
                    作品 {acc.worksCount}
                    {acc.url && (
                      <>
                        <span> · </span>
                        <a
                          href={acc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          主页
                        </a>
                      </>
                    )}
                  </div>
                  {acc.notes && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {acc.notes}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSyncAccount(acc.id)}
                  >
                    同步作品
                  </Button>
                  <Link href={`/benchmark-accounts/${acc.id}`}>
                    <Button size="sm" variant="outline">
                      管理作品
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(acc.id)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
