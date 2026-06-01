'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type SyncConfig = {
  cronExpr: string;
  enabled: boolean;
  syncComments: boolean;
  commentTopWorks: number;
  syncBenchmarks: boolean;
  benchmarkMaxPages: number;
  benchmarkCookieFromAccountId: string | null;
};

type OwnAccount = { id: string; nickname: string };

const PRESETS = [
  { label: '每天 2:00', value: '0 2 * * *' },
  { label: '每天 8:00', value: '0 8 * * *' },
  { label: '每 6 小时', value: '0 */6 * * *' },
  { label: '每小时', value: '0 * * * *' },
];

export default function SyncSettingsPage() {
  const [config, setConfig] = useState<SyncConfig>({
    cronExpr: '0 2 * * *',
    enabled: true,
    syncComments: false,
    commentTopWorks: 5,
    syncBenchmarks: false,
    benchmarkMaxPages: 5,
    benchmarkCookieFromAccountId: null,
  });
  const [ownAccounts, setOwnAccounts] = useState<OwnAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch('/api/settings/sync')
      .then((r) => r.json())
      .then((data: SyncConfig) => setConfig(data))
      .catch(() => toast.error('加载配置失败'));
    fetch('/api/platforms/douyin/accounts')
      .then((r) => r.json())
      .then((data: OwnAccount[]) => setOwnAccounts(data))
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/sync', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || '保存失败');
      }

      toast.success('已保存，定时任务已重新调度');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    if (!confirm('立即对所有账号执行一次同步？耗时取决于账号数量。')) return;

    setRunning(true);
    try {
      const res = await fetch('/api/settings/sync', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '同步失败');
      }
      const result = await res.json();
      const parts = [
        `账号 ${result.accounts - result.accountsFailed}/${result.accounts}`,
        `作品 ${result.worksTouched} 条`,
      ];
      if (config.syncComments) {
        parts.push(
          `评论作品 ${result.commentWorksOk} 个（拉取 ${result.commentsTouched} 条评论）`,
        );
        if (result.commentWorksFailed > 0) {
          parts.push(`评论失败 ${result.commentWorksFailed}`);
        }
      }
      if (config.syncBenchmarks) {
        parts.push(
          `对标 ${result.benchmarksOk} 成功 / ${result.benchmarksFailed} 失败（拉 ${result.benchmarkWorksTouched} 条）`,
        );
      }
      toast.success(`同步完成：${parts.join(' · ')}`, { duration: 8000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同步失败');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">定时同步</h1>

      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={config.enabled}
              onChange={(e) =>
                setConfig({ ...config, enabled: e.target.checked })
              }
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="enabled" className="cursor-pointer">
              启用定时同步
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            关闭后定时任务停止，仅可手动触发
          </p>
        </div>

        <div className="space-y-2">
          <Label>同步频率（cron 表达式）</Label>
          <Input
            value={config.cronExpr}
            onChange={(e) => setConfig({ ...config, cronExpr: e.target.value })}
            placeholder="0 2 * * *"
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
          <p className="text-xs text-muted-foreground">
            格式：分 时 日 月 周。常用：
            <code className="mx-1">0 2 * * *</code>= 每天 2:00
          </p>
        </div>

        <div className="border-t pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="syncComments"
              checked={config.syncComments}
              onChange={(e) =>
                setConfig({ ...config, syncComments: e.target.checked })
              }
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="syncComments" className="cursor-pointer">
              同步评论（仅 Top N 高播放作品）
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            勾选后，每次同步会自动拉取每个账号 Top N 高播放作品的评论
          </p>
        </div>

        {config.syncComments && (
          <div className="space-y-2">
            <Label>每个账号同步多少个作品的评论</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={config.commentTopWorks}
              onChange={(e) =>
                setConfig({
                  ...config,
                  commentTopWorks: Math.max(
                    1,
                    Math.min(50, Number(e.target.value) || 5),
                  ),
                })
              }
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              数量越多越耗时，建议 5-10
            </p>
          </div>
        )}

        <div className="border-t pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="syncBenchmarks"
              checked={config.syncBenchmarks}
              onChange={(e) =>
                setConfig({ ...config, syncBenchmarks: e.target.checked })
              }
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="syncBenchmarks" className="cursor-pointer">
              同步对标账号作品
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            勾选后，每次同步会自动拉取所有对标账号的最新作品
          </p>
        </div>

        {config.syncBenchmarks && (
          <>
            <div className="space-y-2">
              <Label>每个对标账号同步页数（每页 18 条）</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={config.benchmarkMaxPages}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    benchmarkMaxPages: Math.max(
                      1,
                      Math.min(200, Number(e.target.value) || 5),
                    ),
                  })
                }
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                增量同步建议 3-5 页（更新最近作品的指标）
              </p>
            </div>

            <div className="space-y-2">
              <Label>用哪个本机账号的 Cookie 抓取</Label>
              <select
                value={config.benchmarkCookieFromAccountId || ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    benchmarkCookieFromAccountId: e.target.value || null,
                  })
                }
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">不使用 Cookie</option>
                {ownAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nickname}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                借用本机已绑定抖音账号的 Cookie，命中率更高
              </p>
            </div>
          </>
        )}

        <div className="flex gap-2 border-t pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </Button>
          <Button
            variant="outline"
            onClick={handleRunNow}
            disabled={running}
          >
            {running ? '同步中...' : '立即同步一次'}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">cron 表达式说明</h2>
        <pre className="rounded-md bg-muted p-3 text-xs">
{`字段顺序：分 时 日 月 周
*  *  *  *  *
│  │  │  │  └── 周（0-7，0/7=周日）
│  │  │  └───── 月（1-12）
│  │  └──────── 日（1-31）
│  └─────────── 时（0-23）
└────────────── 分（0-59）

示例：
0 2 * * *      每天 2:00
0 */6 * * *    每 6 小时
0 9 * * 1      每周一 9:00
30 8,18 * * *  每天 8:30 和 18:30`}
        </pre>
      </Card>
    </div>
  );
}
