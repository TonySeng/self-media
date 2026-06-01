'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Markdown } from '@/components/ai/markdown';
import { parseSSEStream } from '@/lib/sse';
import { toast } from 'sonner';

type Account = {
  id: string;
  nickname: string;
};

export default function TopicSuggestPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [niche, setNiche] = useState('');
  const [direction, setDirection] = useState('');
  const [generating, setGenerating] = useState(false);
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

  async function handleGenerate() {
    if (!niche.trim() || !direction.trim()) {
      toast.error('请填写账号定位和选题方向');
      return;
    }

    setGenerating(true);
    setResult('');

    try {
      const res = await fetch('/api/ai/topic-suggest/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId || null,
          niche: niche.trim(),
          direction: direction.trim(),
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '生成失败');
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
      toast.success('选题建议已生成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
      setResult(null);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveAsMaterial() {
    if (!result) return;
    setSavingMaterial(true);
    try {
      const title = `选题建议：${niche || '通用'} - ${direction || ''}`.slice(0, 100);
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'TOPIC',
          title,
          content: result,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || '保存失败');
      }
      toast.success('已保存到素材库（选题）');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingMaterial(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">AI 选题建议</h1>

      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label>选择账号</Label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.nickname}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            AI 将基于该账号的历史爆款数据生成选题建议
          </p>
        </div>

        <div className="space-y-2">
          <Label>账号定位</Label>
          <Input
            placeholder="例如：美食探店、科技数码、旅行 vlog"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>选题方向</Label>
          <Input
            placeholder="例如：夏日冷饮、新品测评、周边游推荐"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          />
        </div>

        <Button onClick={handleGenerate} disabled={generating} className="w-full">
          {generating ? '生成中...' : '生成选题建议'}
        </Button>
      </Card>

      {result && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">AI 生成结果</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveAsMaterial}
              disabled={savingMaterial}
            >
              {savingMaterial ? '保存中...' : '保存为素材'}
            </Button>
          </div>
          <div className="rounded-md bg-muted p-3">
            <Markdown>{result}</Markdown>
          </div>
        </Card>
      )}
    </div>
  );
}
