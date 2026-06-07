'use client';

import { useEffect, useState } from 'react';

type BenchmarkWork = {
  id: string;
  title: string;
  play: number | null;
  like: number | null;
};

type Props = {
  benchmarkAccountId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
};

export function BenchmarkWorksPicker({
  benchmarkAccountId,
  value,
  onChange,
  max = 10,
}: Props) {
  const [works, setWorks] = useState<BenchmarkWork[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!benchmarkAccountId) {
      setWorks([]);
      return;
    }
    setLoading(true);
    fetch(`/api/benchmark-works?accountId=${benchmarkAccountId}`)
      .then((r) => r.json())
      .then((data: { items: BenchmarkWork[] }) => {
        const sorted = [...data.items]
          .sort((a, b) => (b.play ?? 0) - (a.play ?? 0))
          .slice(0, 20);
        setWorks(sorted);
      })
      .catch(() => setWorks([]))
      .finally(() => setLoading(false));
  }, [benchmarkAccountId]);

  if (!benchmarkAccountId) return null;
  if (loading) {
    return <p className="text-xs text-muted-foreground">加载作品中…</p>;
  }
  if (works.length === 0) {
    return <p className="text-xs text-muted-foreground">该账号暂无录入作品</p>;
  }

  const reachedMax = value.length >= max;

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id));
    } else if (!reachedMax) {
      onChange([...value, id]);
    }
  }

  return (
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
      <div className="mb-1 text-xs text-muted-foreground">
        勾选作品作为对标参考（已选 {value.length} / {max}）
      </div>
      {works.map((w) => {
        const checked = value.includes(w.id);
        const disabled = !checked && reachedMax;
        return (
          <label
            key={w.id}
            className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1 text-xs hover:bg-muted ${
              disabled ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(w.id)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="truncate">{w.title}</div>
              <div className="text-muted-foreground">
                播放 {(w.play ?? 0).toLocaleString()} · 点赞{' '}
                {(w.like ?? 0).toLocaleString()}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
