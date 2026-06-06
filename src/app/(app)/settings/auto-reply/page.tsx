'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type AutoReplyConfig = {
  enabled: boolean;
  cronExpr: string;
  fixedReply: string;
  blacklistKeywords: string[];
  perWorkLimit: number;
  perAccountDailyLimit: number;
  intervalMinSec: number;
  intervalMaxSec: number;
  notifyEmail: string;
  notifyWebhook: string;
};

type AccountState = {
  tokenExpired: boolean;
  tokenExpiredAt: string | null;
  lastFailedAt: string | null;
  lastFailedReason: string | null;
  todayDate: string;
  todayCount: number;
};

type OwnAccount = { id: string; nickname: string };

const PRESETS = [
  { label: '每 30 分钟', value: '*/30 * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每 2 小时', value: '0 */2 * * *' },
  { label: '每天 9:00', value: '0 9 * * *' },
];

const DEFAULT_CONFIG: AutoReplyConfig = {
  enabled: false,
  cronExpr: '*/30 * * * *',
  fixedReply: '',
  blacklistKeywords: [],
  perWorkLimit: 10,
  perAccountDailyLimit: 10,
  intervalMinSec: 30,
  intervalMaxSec: 90,
  notifyEmail: '',
  notifyWebhook: '',
};

export default function AutoReplySettingsPage() {
  const [config, setConfig] = useState<AutoReplyConfig>(DEFAULT_CONFIG);
  const [blacklistText, setBlacklistText] = useState('');
  const [accounts, setAccounts] = useState<OwnAccount[]>([]);
  const [states, setStates] = useState<Record<string, AccountState>>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch('/api/auto-reply/config')
      .then((r) => r.json())
      .then((data: AutoReplyConfig) => {
        const merged = { ...DEFAULT_CONFIG, ...data };
        setConfig(merged);
        setBlacklistText((merged.blacklistKeywords ?? []).join('\n'));
      })
      .catch(() => toast.error('加载配置失败'));

    fetch('/api/platforms/douyin/accounts')
      .then((r) => r.json())
      .then((data: OwnAccount[]) => {
        setAccounts(data);
        for (const a of data) {
          fetch(`/api/auto-reply/accounts/${a.id}/state`)
            .then((r) => r.json())
            .then((s: AccountState) =>
              setStates((prev) => ({ ...prev, [a.id]: s })),
            )
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const blacklist = blacklistText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = { ...config, blacklistKeywords: blacklist };

      const res = await fetch('/api/auto-reply/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || '保存失败');
      }

      toast.success('已保存，定时任务已重新调度');
      setConfig(payload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    if (!confirm('立即对所有账号执行一次自动回复？将真实调用抖音回写接口。')) return;

    setRunning(true);
    try {
      const res = await fetch('/api/auto-reply/run', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '执行失败');
      }
      const result = await res.json();
      toast.success(
        `执行完成：账号 ${result.accountsOk}/${
          result.accountsOk + result.accountsFailed
        }，成功回复 ${result.repliedTotal} 条，跳过 ${result.skippedTotal}`,
        { duration: 8000 },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '执行失败');
    } finally {
      setRunning(false);
    }
  }

  async function handleResetToken(accountId: string) {
    if (!confirm('清除该账号的 token 失效标记？下次 cron 会重新尝试。')) return;
    try {
      const res = await fetch(`/api/auto-reply/accounts/${accountId}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokenExpired: false,
          tokenExpiredAt: null,
          lastFailedReason: null,
        }),
      });
      if (!res.ok) throw new Error('重置失败');
      const fresh = await fetch(`/api/auto-reply/accounts/${accountId}/state`).then((r) => r.json());
      setStates((prev) => ({ ...prev, [accountId]: fresh }));
      toast.success('已重置，下次 cron 将重新尝试');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重置失败');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">评论自动回复</h1>
      <p className="text-sm text-muted-foreground">
        定时扫描已同步的评论，对未回复的顶层评论自动生成或按模板回复。失败立即停账号本轮。
      </p>

      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="enabled" className="cursor-pointer">
              启用自动回复
            </Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>执行频率（cron 表达式）</Label>
          <Input
            value={config.cronExpr}
            onChange={(e) => setConfig({ ...config, cronExpr: e.target.value })}
            placeholder="*/30 * * * *"
            disabled={!config.enabled}
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setConfig({ ...config, cronExpr: p.value })}
                disabled={!config.enabled}
                className={`rounded-md border px-3 py-1 text-xs transition-colors ${
                  config.cronExpr === p.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                } disabled:opacity-50`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>固定回复文案（留空则走 AI 生成）</Label>
          <textarea
            value={config.fixedReply}
            onChange={(e) => setConfig({ ...config, fixedReply: e.target.value })}
            placeholder="例如：感谢支持！🎉"
            rows={2}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            填了文案就所有命中评论都用它，不会调用 AI；留空则走 COMMENT_REPLY Prompt 生成。
          </p>
        </div>

        <div className="space-y-2">
          <Label>黑名单关键词（一行一个，命中即跳过）</Label>
          <textarea
            value={blacklistText}
            onChange={(e) => setBlacklistText(e.target.value)}
            placeholder={'诈骗\n广告\nhttp'}
            rows={4}
            className="w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            子串匹配，大小写不敏感。包含关键词的评论标记 SKIPPED，不发送。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <div className="space-y-2">
            <Label>每作品每轮上限</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={config.perWorkLimit}
              onChange={(e) =>
                setConfig({
                  ...config,
                  perWorkLimit: Math.max(1, Math.min(100, Number(e.target.value) || 10)),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>每账号每天上限</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={config.perAccountDailyLimit}
              onChange={(e) =>
                setConfig({
                  ...config,
                  perAccountDailyLimit: Math.max(1, Math.min(500, Number(e.target.value) || 10)),
                })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>每条间隔最短（秒）</Label>
            <Input
              type="number"
              min={1}
              max={3600}
              value={config.intervalMinSec}
              onChange={(e) =>
                setConfig({
                  ...config,
                  intervalMinSec: Math.max(1, Math.min(3600, Number(e.target.value) || 30)),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>每条间隔最长（秒）</Label>
            <Input
              type="number"
              min={1}
              max={3600}
              value={config.intervalMaxSec}
              onChange={(e) =>
                setConfig({
                  ...config,
                  intervalMaxSec: Math.max(1, Math.min(3600, Number(e.target.value) || 90)),
                })
              }
            />
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>失败通知邮箱（可空）</Label>
          <Input
            value={config.notifyEmail}
            onChange={(e) => setConfig({ ...config, notifyEmail: e.target.value })}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label>失败通知 Webhook URL（可空）</Label>
          <Input
            value={config.notifyWebhook}
            onChange={(e) => setConfig({ ...config, notifyWebhook: e.target.value })}
            placeholder="https://..."
          />
        </div>

        <div className="flex gap-2 border-t pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </Button>
          <Button variant="outline" onClick={handleRunNow} disabled={running}>
            {running ? '执行中...' : '立即执行一次'}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">账号当前状态</h2>
        {accounts.length === 0 ? (
          <div className="text-xs text-muted-foreground">尚未绑定任何账号。</div>
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => {
              const s = states[a.id];
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{a.nickname}</span>
                    {s ? (
                      <>
                        <span className="text-xs text-muted-foreground">
                          今日 {s.todayCount}/{config.perAccountDailyLimit}
                        </span>
                        {s.tokenExpired ? (
                          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">
                            token 已失效
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">
                            正常
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">加载中...</span>
                    )}
                  </div>
                  {s?.tokenExpired && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResetToken(a.id)}
                    >
                      重置
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
