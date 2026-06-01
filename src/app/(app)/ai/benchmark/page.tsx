'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Markdown } from '@/components/ai/markdown';
import { parseSSEStream } from '@/lib/sse';
import { toast } from 'sonner';

type Account = { id: string; nickname: string };

type Reference = {
  id: string;
  title: string;
  url: string | null;
  createdAt: string;
};

type BenchmarkAccount = {
  id: string;
  nickname: string;
  niche: string | null;
  followers: number | null;
  worksCount: number;
};

const TOP_N_OPTIONS = [3, 5, 10];

export default function BenchmarkPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [ownTopN, setOwnTopN] = useState(5);
  const [tab, setTab] = useState<'accounts' | 'references'>('accounts');

  const [bmAccounts, setBmAccounts] = useState<BenchmarkAccount[]>([]);
  const [selectedBmAccountIds, setSelectedBmAccountIds] = useState<Set<string>>(
    new Set(),
  );

  const [references, setReferences] = useState<Reference[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/platforms/douyin/accounts')
      .then((r) => r.json())
      .then((data: Account[]) => {
        setAccounts(data);
        if (data.length > 0) setAccountId(data[0]!.id);
      })
      .catch(() => toast.error('加载本账号失败'));
  }, []);

  useEffect(() => {
    fetch('/api/benchmark-accounts')
      .then((r) => r.json())
      .then((j: { items: BenchmarkAccount[] }) => setBmAccounts(j.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/materials?type=REFERENCE')
      .then((r) => r.json())
      .then((data: Reference[]) => setReferences(data))
      .catch(() => {});
  }, []);

  function toggleBmAccount(id: string) {
    const next = new Set(selectedBmAccountIds);
    if (next.has(id)) next.delete(id);
    else {
      if (next.size >= 5) {
        toast.error('最多选择 5 个对标账号');
        return;
      }
      next.add(id);
    }
    setSelectedBmAccountIds(next);
  }

  function toggleRef(id: string) {
    const next = new Set(selectedRefs);
    if (next.has(id)) next.delete(id);
    else {
      if (next.size >= 10) {
        toast.error('最多选择 10 个对标素材');
        return;
      }
      next.add(id);
    }
    setSelectedRefs(next);
  }

  async function handleAnalyze() {
    if (!accountId) {
      toast.error('请选择本账号');
      return;
    }

    const useAccounts = tab === 'accounts';
    const ids = useAccounts ? selectedBmAccountIds : selectedRefs;
    if (ids.size === 0) {
      toast.error(useAccounts ? '请至少选择 1 个对标账号' : '请至少选择 1 个对标爆款');
      return;
    }

    setAnalyzing(true);
    setResult('');

    try {
      const body: Record<string, unknown> = { accountId, ownTopN };
      if (useAccounts) {
        body.benchmarkAccountIds = Array.from(ids);
      } else {
        body.benchmarkIds = Array.from(ids);
      }

      const res = await fetch('/api/ai/benchmark/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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
      toast.success('对标分析完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '分析失败');
      setResult(null);
    } finally {
      setAnalyzing(false);
    }
  }

  const filtered = searchQuery
    ? references.filter((r) =>
        r.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : references;

  const totalSelected =
    tab === 'accounts' ? selectedBmAccountIds.size : selectedRefs.size;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI 对标分析</h1>
        <Button onClick={handleAnalyze} disabled={analyzing || totalSelected === 0}>
          {analyzing ? '分析中...' : `开始对标分析 (${totalSelected})`}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        选择对标账号或参考素材，AI 会对比本账号 Top 作品，输出可执行的对标策略
      </p>

      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>本账号</Label>
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
            <Label>本账号参考作品数</Label>
            <div className="flex gap-2">
              {TOP_N_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setOwnTopN(n)}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                    ownTopN === n
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  Top {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {result && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">AI 对标分析结果</h2>
          <div className="rounded-md bg-muted p-3">
            <Markdown>{result}</Markdown>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => setTab('accounts')}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === 'accounts'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            对标账号
            {selectedBmAccountIds.size > 0 && ` (${selectedBmAccountIds.size})`}
          </button>
          <button
            onClick={() => setTab('references')}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === 'references'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            参考素材
            {selectedRefs.size > 0 && ` (${selectedRefs.size})`}
          </button>
        </div>

        {tab === 'accounts' ? (
          <div className="space-y-2">
            {bmAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                还没有对标账号。
                <Link
                  href="/benchmark-accounts"
                  className="ml-1 text-blue-600 hover:underline"
                >
                  去添加
                </Link>
              </p>
            ) : (
              bmAccounts.map((acc) => {
                const selected = selectedBmAccountIds.has(acc.id);
                return (
                  <div
                    key={acc.id}
                    onClick={() => toggleBmAccount(acc.id)}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{acc.nickname}</span>
                        {acc.niche && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {acc.niche}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {acc.followers != null &&
                          `粉丝 ${acc.followers.toLocaleString()} · `}
                        作品 {acc.worksCount}
                        {acc.worksCount === 0 && ' （建议先录入作品再使用）'}
                      </div>
                    </div>
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground'
                      }`}
                    >
                      {selected && <span className="text-xs">✓</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
            <Input
              placeholder="搜索素材标题"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-3 w-full sm:w-60"
            />
            <div className="space-y-2">
              {filtered.map((ref) => {
                const selected = selectedRefs.has(ref.id);
                return (
                  <div
                    key={ref.id}
                    onClick={() => toggleRef(ref.id)}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">
                        {ref.title}
                      </div>
                      {ref.url && (
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {ref.url}
                        </a>
                      )}
                    </div>
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground'
                      }`}
                    >
                      {selected && <span className="text-xs">✓</span>}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {references.length === 0
                    ? '暂无参考类素材。先在素材库新建"参考"类型素材。'
                    : '没有匹配的素材'}
                </p>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
