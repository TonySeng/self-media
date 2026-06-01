'use client';

import { useEffect, useState } from 'react';
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

const PERIOD_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 60, label: '近 60 天' },
  { value: 90, label: '近 90 天' },
];

export default function TrendAnalysisPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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

  async function handleAnalyze() {
    if (!accountId) {
      toast.error('请选择账号');
      return;
    }

    setAnalyzing(true);
    setResult('');

    try {
      const res = await fetch('/api/ai/trend/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, periodDays }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '分析失败');
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
      toast.success('趋势分析完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '分析失败');
      setResult(null);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">AI 趋势分析</h1>

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
        </div>

        <div className="space-y-2">
          <Label>分析周期</Label>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriodDays(opt.value)}
                className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                  periodDays === opt.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            AI 将分析所选周期内的粉丝、播放、互动等趋势数据
          </p>
        </div>

        <Button
          onClick={handleAnalyze}
          disabled={analyzing || !accountId}
          className="w-full"
        >
          {analyzing ? '分析中...' : '开始趋势分析'}
        </Button>
      </Card>

      {result && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">AI 趋势分析结果</h2>
          <div className="rounded-md bg-muted p-3">
            <Markdown>{result}</Markdown>
          </div>
        </Card>
      )}
    </div>
  );
}
