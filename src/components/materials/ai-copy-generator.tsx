'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseSSEStream } from '@/lib/sse';
import {
  parseGeneratedCopies,
  type GeneratedCopyCard,
} from '@/lib/ai-tasks/parse-generated-copies';
import { BenchmarkWorksPicker } from './benchmark-works-picker';
import { toast } from 'sonner';

type Account = { id: string; nickname: string };
type BenchmarkAccount = { id: string; nickname: string };

type EditableCard = GeneratedCopyCard & { id: string; selected: boolean };

type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'finish'; analysisId: string; result: string }
  | { type: 'error'; message: string };

export function AICopyGenerator() {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  const [niche, setNiche] = useState('');
  const [direction, setDirection] = useState('');
  const [count, setCount] = useState(5);
  const [referenceAccountId, setReferenceAccountId] = useState('');
  const [benchmarkAccountId, setBenchmarkAccountId] = useState('');
  const [benchmarkWorkIds, setBenchmarkWorkIds] = useState<string[]>([]);
  const [ownerAccountId, setOwnerAccountId] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [benchmarkAccounts, setBenchmarkAccounts] = useState<BenchmarkAccount[]>([]);

  const [generating, setGenerating] = useState(false);
  const [cards, setCards] = useState<EditableCard[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/platforms/douyin/accounts')
      .then((r) => r.json())
      .then((data: Account[]) => setAccounts(data))
      .catch(() => {});
    fetch('/api/benchmark-accounts')
      .then((r) => r.json())
      .then((j: { items: BenchmarkAccount[] }) => setBenchmarkAccounts(j.items ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (referenceAccountId && !ownerAccountId) {
      setOwnerAccountId(referenceAccountId);
    }
  }, [referenceAccountId, ownerAccountId]);

  useEffect(() => {
    setBenchmarkWorkIds([]);
  }, [benchmarkAccountId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function applyParse(text: string, streaming: boolean) {
    const parsed = parseGeneratedCopies(text, streaming);
    if (!streaming && parsed.length === 1 && !text.includes('---')) {
      setWarning('模型未严格分隔，已合并为单条。可手动编辑或重新生成。');
    } else {
      setWarning(null);
    }
    setCards(
      parsed.map((c, i) => ({
        ...c,
        id: `card-${i}`,
        selected: true,
      })),
    );
  }

  async function handleGenerate() {
    if (!niche.trim() || !direction.trim()) {
      toast.error('请填写账号定位和本次方向');
      return;
    }
    if (count < 1 || count > 20) {
      toast.error('数量必须在 1–20 之间');
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setGenerating(true);
    setCards([]);
    setWarning(null);
    setAnalysisId(null);

    try {
      const res = await fetch('/api/ai/copy-batch-gen/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: niche.trim(),
          direction: direction.trim(),
          count,
          referenceAccountId: referenceAccountId || null,
          benchmarkAccountId: benchmarkAccountId || null,
          benchmarkWorkIds: benchmarkAccountId ? benchmarkWorkIds : [],
          ownerAccountId: ownerAccountId || null,
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || '生成失败');
      }

      let fullText = '';
      for await (const ev of parseSSEStream<StreamEvent>(res.body)) {
        if (ev.type === 'text') {
          fullText += ev.delta;
          applyParse(fullText, true);
        } else if (ev.type === 'finish') {
          fullText = ev.result;
          applyParse(fullText, false);
          setAnalysisId(ev.analysisId);
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }
      toast.success('生成完成');
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        toast.message('已取消生成');
      } else {
        toast.error(e instanceof Error ? e.message : '生成失败');
      }
    } finally {
      setGenerating(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function updateCard(id: string, patch: Partial<EditableCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handleSave() {
    const items = cards
      .filter((c) => c.selected && c.content.trim())
      .map((c) => ({
        title: (c.title.trim() || c.content.trim().slice(0, 30)).slice(0, 100),
        content: c.content.trim().slice(0, 5000),
      }));
    if (items.length === 0) {
      toast.error('请至少勾选一条文案');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ai/copy-batch-gen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          ownerAccountId: ownerAccountId || null,
          sourceAnalysisId: analysisId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || '保存失败');
      }
      const data = await res.json() as { created: number };
      toast.success(`已保存 ${data.created} 条到素材库`);
      router.push('/materials?type=COPY');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = cards.filter((c) => c.selected).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="space-y-4 p-4 lg:col-span-2">
        <h2 className="text-lg font-medium">生成参数</h2>

        <div className="space-y-2">
          <Label>账号定位 / 品类 *</Label>
          <Input
            value={niche}
            onChange={(e) => setNiche(e.target.value.slice(0, 50))}
            placeholder="例：家居 vlog"
          />
        </div>

        <div className="space-y-2">
          <Label>本次方向 / 要求 *</Label>
          <textarea
            value={direction}
            onChange={(e) => setDirection(e.target.value.slice(0, 500))}
            placeholder="例：推荐 3 件平价好物，强调实用与性价比"
            className="h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">{direction.length} / 500</p>
        </div>

        <div className="space-y-2">
          <Label>生成数量（1–20）*</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => {
              const n = Number(e.target.value);
              setCount(Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 5);
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>参考本账号风格（可选）</Label>
          <select
            value={referenceAccountId}
            onChange={(e) => setReferenceAccountId(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">不参考本账号风格</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>对标账号（可选）</Label>
          <select
            value={benchmarkAccountId}
            onChange={(e) => setBenchmarkAccountId(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">不使用对标账号</option>
            {benchmarkAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
        </div>

        {benchmarkAccountId && (
          <BenchmarkWorksPicker
            benchmarkAccountId={benchmarkAccountId}
            value={benchmarkWorkIds}
            onChange={setBenchmarkWorkIds}
          />
        )}

        <div className="space-y-2">
          <Label>入库归属账号（可选）</Label>
          <select
            value={ownerAccountId}
            onChange={(e) => setOwnerAccountId(e.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">通用素材（不归属任何账号）</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="flex-1"
          >
            {generating ? '生成中…' : `生成 ${count} 条文案`}
          </Button>
          {generating && (
            <Button variant="outline" onClick={handleCancel}>
              取消
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-4 lg:col-span-3">
        <h2 className="mb-3 text-lg font-medium">预览</h2>

        {warning && (
          <div className="mb-3 rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800">
            {warning}
          </div>
        )}

        {cards.length === 0 && !generating && (
          <p className="text-sm text-muted-foreground">
            填写左侧表单后点&ldquo;生成&rdquo;，结果会在这里逐条出现。
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {cards.map((c) => (
            <div
              key={c.id}
              className={`rounded-md border p-3 ${
                c.selected ? 'border-primary/40 bg-primary/5' : 'opacity-60'
              }`}
            >
              <div className="mb-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={c.selected}
                  onChange={(e) =>
                    updateCard(c.id, { selected: e.target.checked })
                  }
                  className="mt-1"
                />
                <Input
                  value={c.title}
                  onChange={(e) => updateCard(c.id, { title: e.target.value })}
                  placeholder="标题"
                  className="text-sm font-medium"
                />
              </div>
              <textarea
                value={c.content}
                onChange={(e) => updateCard(c.id, { content: e.target.value })}
                className="h-32 w-full rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{c.content.length} 字符</span>
                {!c.done && <span className="animate-pulse">▍ 生成中…</span>}
              </div>
            </div>
          ))}
        </div>

        {cards.length > 0 && (
          <div className="sticky bottom-0 mt-4 flex items-center justify-between border-t bg-card pt-3">
            <Button variant="outline" onClick={() => void handleGenerate()} disabled={generating}>
              一键再来一批
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                已选 {selectedCount} / {cards.length}
              </span>
              <Button
                onClick={() => void handleSave()}
                disabled={saving || generating || selectedCount === 0}
              >
                {saving ? '保存中…' : `保存所选（${selectedCount}）`}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
