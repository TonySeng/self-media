'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
  const [secUid, setSecUid] = useState('');
  const [nickname, setNickname] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  async function load() {
    const res = await fetch('/api/platforms/douyin/accounts');
    if (res.ok) setAccounts(((await res.json()) as Account[]));
  }

  useEffect(() => { void load(); }, []);

  async function add() {
    if (!cookie.trim() || !secUid.trim()) return;
    setAdding(true);
    const res = await fetch('/api/platforms/douyin/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cookie: cookie.trim(),
        secUid: secUid.trim(),
        nickname: nickname.trim() || undefined,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(j.message ?? '添加失败');
      return;
    }
    toast.success('账号已添加');
    setCookie('');
    setSecUid('');
    setNickname('');
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

  async function rename(id: string, newNickname: string) {
    const res = await fetch(`/api/platforms/douyin/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: newNickname.trim() }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(j.message ?? '修改失败');
      return false;
    }
    toast.success('已更新');
    await load();
    return true;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">平台账号</h1>

      {typeof window !== 'undefined' && window.electron && (
        <ChromeImportCard onImported={load} />
      )}

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Label>添加抖音账号（粘贴 Cookie）</Label>
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => setHelpOpen((v) => !v)}
          >
            {helpOpen ? '收起说明' : '如何获取 Cookie？'}
          </button>
        </div>

        {helpOpen && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed space-y-3">
            <div>
              <p className="font-medium">① 抓取 Cookie</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  浏览器访问{' '}
                  <a
                    href="https://creator.douyin.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-blue-600 hover:underline"
                  >
                    https://creator.douyin.com/
                  </a>{' '}
                  并完成登录
                </li>
                <li>登录后停在创作者中心首页，按 <kbd className="rounded bg-background px-1 py-0.5 font-mono text-[11px] shadow">F12</kbd> 打开 DevTools → <span className="font-medium">Network</span> 面板</li>
                <li>按 <kbd className="rounded bg-background px-1 py-0.5 font-mono text-[11px] shadow">F5</kbd> 刷新，任选一个发往 <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">creator.douyin.com</code> 的请求</li>
                <li>右侧 Headers → Request Headers，找到 <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">cookie:</code> 整行复制（不含 <code className="font-mono">cookie:</code> 前缀）粘到下面</li>
                <li>必要 key：<code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">sessionid_ss</code>。整行复制可以一次性带上 <code className="font-mono">ttwid</code>、<code className="font-mono">sid_guard</code>、<code className="font-mono">odin_tt</code>、<code className="font-mono">passport_csrf_token</code> 等签名所需字段</li>
              </ol>
            </div>

            <div>
              <p className="font-medium">② 获取 sec_uid（你的抖音号唯一标识）</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>在创作者中心或 <code className="font-mono">www.douyin.com</code> 页面右上角点自己的头像，跳到个人主页</li>
                <li>地址栏会变成 <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">https://www.douyin.com/user/MS4wLjAB...</code></li>
                <li>复制 <code className="font-mono">MS4wLjAB</code> 开头到 URL 末尾（或第一个 <code className="font-mono">?</code> 之前）的整段，粘到下面 sec_uid 输入框</li>
              </ol>
            </div>

            <p className="text-muted-foreground">
              提示：cookie 通常 7~30 天后失效，状态变为「已失效」时回到此处粘贴新 cookie 即可（sec_uid 不变，会按 sec_uid 自动覆盖原账号）。
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground" htmlFor="cookie-input">
            Cookie
          </Label>
          <textarea
            id="cookie-input"
            className="h-28 w-full rounded-md border px-3 py-2 font-mono text-xs"
            placeholder="sessionid_ss=...; ttwid=...; passport_csrf_token=...; ..."
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="secuid-input">
              sec_uid（必填）
            </Label>
            <input
              id="secuid-input"
              type="text"
              className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              placeholder="MS4wLjAB..."
              value={secUid}
              onChange={(e) => setSecUid(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="nickname-input">
              账号昵称（选填）
            </Label>
            <input
              id="nickname-input"
              type="text"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="给账号起个备注名"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={add} disabled={adding || !cookie.trim() || !secUid.trim()}>
          {adding ? '添加中…' : '添加账号'}
        </Button>
      </Card>

      <div className="space-y-3">
        {accounts.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            syncing={syncingId === a.id}
            onSync={() => void sync(a.id)}
            onRemove={() => void remove(a.id)}
            onRename={(newNickname) => rename(a.id, newNickname)}
            onRefresh={() => void load()}
          />
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有账号，先在上方添加一个吧。</p>
        )}
      </div>
    </div>
  );
}

function AccountRow({
  account,
  syncing,
  onSync,
  onRemove,
  onRename,
  onRefresh,
}: {
  account: Account;
  syncing: boolean;
  onSync: () => void;
  onRemove: () => void;
  onRename: (newNickname: string) => Promise<boolean>;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.nickname);
  const [saving, setSaving] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [updateCookie, setUpdateCookie] = useState('');
  const [updateSecUid, setUpdateSecUid] = useState('');
  const [updating, setUpdating] = useState(false);

  function startEdit() {
    setDraft(account.nickname);
    setEditing(true);
  }

  async function save() {
    if (!draft.trim() || draft.trim() === account.nickname) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onRename(draft);
    setSaving(false);
    if (ok) setEditing(false);
  }

  async function handleUpdate() {
    if (!updateCookie.trim() && !updateSecUid.trim()) return;
    setUpdating(true);
    const body: Record<string, string> = {};
    if (updateCookie.trim()) body.cookie = updateCookie.trim();
    if (updateSecUid.trim()) body.secUid = updateSecUid.trim();

    const res = await fetch(`/api/platforms/douyin/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setUpdating(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(j.message ?? '更新失败');
      return;
    }
    toast.success('已更新');
    setUpdateCookie('');
    setUpdateSecUid('');
    setShowUpdate(false);
    onRefresh();
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={account.avatar ?? '/avatar-fallback.svg'} alt="" className="h-10 w-10 rounded-full" />
        <div className="flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                className="rounded-md border px-2 py-1 text-sm"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save();
                  if (e.key === 'Escape') setEditing(false);
                }}
                disabled={saving}
              />
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                取消
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-medium">{account.nickname}</span>
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={startEdit}
              >
                编辑
              </button>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            状态：<StatusBadge s={account.cookieStatus} /> · 最近同步：
            {account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : '从未'}
          </div>
          {account.lastError && (
            <div className="mt-1 text-xs text-red-500">最近错误：{account.lastError}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowUpdate(!showUpdate)}>
            {showUpdate ? '收起' : '更新信息'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowSign(!showSign)}>
            {showSign ? '收起签名' : '回复签名'}
          </Button>
          <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
            {syncing ? '同步中…' : '立即同步'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            删除
          </Button>
        </div>
      </div>

      {showUpdate && (
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <div className="text-xs font-medium">更新 Cookie / sec_uid（留空则不修改）</div>
          <div className="space-y-2">
            <textarea
              className="h-20 w-full rounded-md border px-3 py-2 font-mono text-xs"
              placeholder="粘贴新 Cookie（包含 sessionid_ss 的整行）"
              value={updateCookie}
              onChange={(e) => setUpdateCookie(e.target.value)}
            />
            <input
              type="text"
              className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              placeholder="sec_uid（MS4wLjAB...）"
              value={updateSecUid}
              onChange={(e) => setUpdateSecUid(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowUpdate(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => void handleUpdate()}
              disabled={updating || (!updateCookie.trim() && !updateSecUid.trim())}
            >
              {updating ? '更新中…' : '确认更新'}
            </Button>
          </div>
        </div>
      )}

      {showSign && <ReplySignSection accountId={account.id} />}
    </Card>
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

function ReplySignSection({ accountId }: { accountId: string }) {
  const [msToken, setMsToken] = useState('');
  const [aBogus, setABogus] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/platforms/douyin/accounts/${accountId}/reply-sign`)
      .then((r) => r.json())
      .then((j: { msToken: string; aBogus: string; updatedAt: string | null }) => {
        setMsToken(j.msToken || '');
        setABogus(j.aBogus || '');
        setUpdatedAt(j.updatedAt);
      })
      .catch(() => {});
  }, [accountId]);

  async function save() {
    if (!msToken.trim() || !aBogus.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/platforms/douyin/accounts/${accountId}/reply-sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msToken: msToken.trim(), aBogus: aBogus.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('回复签名已更新');
      setUpdatedAt(new Date().toISOString());
    } else {
      toast.error('保存失败');
    }
  }

  const ageMinutes = updatedAt
    ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000)
    : null;

  return (
    <div className="space-y-3 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium">评论回复签名（msToken / a_bogus）</div>
        <button
          type="button"
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setHelpOpen((v) => !v)}
        >
          {helpOpen ? '收起说明' : '如何获取？'}
        </button>
      </div>
      {ageMinutes !== null && (
        <div className={`text-xs ${ageMinutes > 30 ? 'text-orange-500' : 'text-muted-foreground'}`}>
          上次更新：{ageMinutes} 分钟前
          {ageMinutes > 30 && '（签名通常 30 分钟过期，建议重抓）'}
        </div>
      )}

      {helpOpen && (
        <div className="rounded-md border bg-background p-3 text-xs leading-relaxed space-y-2">
          <p className="font-medium">从 F12 抓取一次签名（要在该账号登录态下）：</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>切换到该账号登录抖音创作者中心</li>
            <li>F12 → Network → 在抖音网页上手动回复任意一条评论</li>
            <li>找到 <code className="rounded bg-muted px-1 py-0.5 font-mono">multi_publish/?...</code> 的请求</li>
            <li>从 URL 中复制 <code className="font-mono">msToken=</code> 和 <code className="font-mono">a_bogus=</code> 后面的值，粘到下面</li>
            <li>保存后，系统在 30 分钟有效期内可直接回复该账号的评论</li>
          </ol>
        </div>
      )}

      <input
        type="text"
        className="w-full rounded-md border px-3 py-2 font-mono text-xs"
        placeholder="msToken"
        value={msToken}
        onChange={(e) => setMsToken(e.target.value)}
      />
      <input
        type="text"
        className="w-full rounded-md border px-3 py-2 font-mono text-xs"
        placeholder="a_bogus"
        value={aBogus}
        onChange={(e) => setABogus(e.target.value)}
      />
      <Button size="sm" onClick={() => void save()} disabled={saving || !msToken.trim() || !aBogus.trim()}>
        {saving ? '保存中…' : '保存签名'}
      </Button>
    </div>
  );
}

function ReplySignCard() {
  // 已废弃，签名按账号绑定，使用 ReplySignSection
  return null;
}

// ===== 桌面版专属：从浏览器自动读取 Cookie =====

type ChromeProfile = {
  browserType: 'chrome' | 'edge' | 'brave';
  label: string;
  profilePath: string;
};

function ChromeImportCard({ onImported }: { onImported: () => void }) {
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [secUid, setSecUid] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  async function fetchProfiles() {
    if (!window.electron) return;
    setLoadingProfiles(true);
    try {
      const list = await window.electron.listChromeProfiles();
      setProfiles(list);
      if (list.length > 0 && list[0]) setSelectedProfile(list[0].profilePath);
    } catch {
      toast.error('读取浏览器列表失败');
    } finally {
      setLoadingProfiles(false);
    }
  }

  useEffect(() => {
    void fetchProfiles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importCookie() {
    if (!selectedProfile || !secUid.trim()) return;
    setLoading(true);
    try {
      const cookie = await window.electron!.readChromeCookies(selectedProfile);
      const res = await fetch('/api/platforms/douyin/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cookie,
          secUid: secUid.trim(),
          nickname: nickname.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(j.message ?? '导入失败');
        return;
      }
      toast.success('Cookie 已从浏览器读取并导入');
      setSecUid('');
      setNickname('');
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '读取 Cookie 失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-3 p-4 border-blue-200 bg-blue-50/30">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">从浏览器自动读取 Cookie</span>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">桌面版专属</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">选择浏览器 Profile</Label>
        {loadingProfiles ? (
          <div className="text-xs text-muted-foreground">检测浏览器中…</div>
        ) : profiles.length === 0 ? (
          <div className="text-xs text-orange-500">未检测到 Chrome / Edge，请确认已安装</div>
        ) : (
          <select
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.profilePath} value={p.profilePath}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground" htmlFor="chrome-secuid">
            sec_uid（必填）
          </Label>
          <input
            id="chrome-secuid"
            type="text"
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
            placeholder="MS4wLjAB..."
            value={secUid}
            onChange={(e) => setSecUid(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground" htmlFor="chrome-nickname">
            账号昵称（选填）
          </Label>
          <input
            id="chrome-nickname"
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="给账号起个备注名"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        请确保已在浏览器中登录抖音，应用会自动读取 <code className="font-mono">douyin.com</code> 的 Cookie。
      </p>

      <Button
        onClick={() => void importCookie()}
        disabled={loading || !selectedProfile || !secUid.trim()}
      >
        {loading ? '读取中…' : '从浏览器读取 Cookie'}
      </Button>
    </Card>
  );
}

