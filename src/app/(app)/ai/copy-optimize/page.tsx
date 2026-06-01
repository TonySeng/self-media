'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Markdown } from '@/components/ai/markdown';
import { parseSSEStream } from '@/lib/sse';
import { toast } from 'sonner';

type Account = {
  id: string;
  nickname: string;
};

export default function CopyOptimizePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [draft, setDraft] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [savingMaterial, setSavingMaterial] = useState(false);

  useEffect(() => {
    fetch('/api/platforms/douyin/accounts')
      .then((r) => r.json())
      .then((data: Account[]) => {
        setAccounts(data);
        if (data.length > 0) {
          setAccountId(data[0]!.id);
        }
      })
      .catch(() => toast.error('加载账号列表失败'));
  }, []);

  async function handleOptimize() {
    if (!draft.trim()) {
      toast.error('请输入草稿文案');
      return;
    }

    if (draft.length > 5000) {
      toast.error('文案长度不能超过 5000 字符');
      return;
    }

    setOptimizing(true);
    setResult('');

    try {
      const res = await fetch('/api/ai/copy-optimize/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          draft: draft.trim(),
          accountId: accountId || null,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '优化失败');
      }

      type Event =
        | { type: 'text'; delta: string }
        | { type: 'finish'; result: string }
        | { type: 'error'; message: string };

      let fullText = '';
      for await (const event of parseSSEStream<Event>(res.body)) {
        if (event.type === 'text') {
          fullText += event.delta;
          setResult(fullText);
        } else if (event.type === 'finish') {
          setResult(event.result);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
      toast.success('文案优化完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '优化失败');
      setResult(null);
    } finally {
      setOptimizing(false);
    }
  }

  async function handleSaveAsMaterial() {
    if (!result) return;
    setSavingMaterial(true);
    try {
      const firstLine = result.split('\n').find((l) => l.trim()) || result;
      const title = `优化文案：${firstLine.slice(0, 30)}`;
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'COPY',
          title,
          content: result,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || '保存失败');
      }
      toast.success('已保存到素材库（文案）');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingMaterial(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">AI 文案优化</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          <div className="space-y-2">
            <Label>选择账号（可选）</Label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">不指定账号</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.nickname}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              选择账号后，AI 将参考该账号的历史高互动文案风格
            </p>
          </div>

          <div className="space-y-2">
            <Label>草稿文案</Label>
            <textarea
              placeholder="输入你的文案草稿..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-64 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              {draft.length} / 5000 字符
            </p>
          </div>

          <Button onClick={handleOptimize} disabled={optimizing} className="w-full">
            {optimizing ? '优化中...' : '优化文案'}
          </Button>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">优化结果</h2>
            {result && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveAsMaterial}
                disabled={savingMaterial}
              >
                {savingMaterial ? '保存中...' : '保存为素材'}
              </Button>
            )}
          </div>
          {result ? (
            <div className="rounded-md bg-muted p-3">
              <Markdown>{result}</Markdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              优化结果将显示在这里
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
