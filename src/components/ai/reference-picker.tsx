'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Work = {
  id: string;
  title: string;
  coverUrl: string | null;
  publishedAt: string;
  account: { nickname: string };
  latestMetric: { play: number; like: number; comment: number } | null;
};

type Material = {
  id: string;
  type: string;
  title: string;
  createdAt: string;
};

type ReferencePickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (refs: { workIds: string[]; materialIds: string[] }) => void;
  initialWorkIds?: string[];
  initialMaterialIds?: string[];
};

const TYPE_LABELS: Record<string, string> = {
  COPY: '文案',
  TOPIC: '选题',
  VIDEO: '视频',
  IMAGE: '图片',
  AUDIO: '音频',
  IDEA: '创意',
  REFERENCE: '参考',
};

export function ReferencePicker({
  open,
  onClose,
  onSelect,
  initialWorkIds = [],
  initialMaterialIds = [],
}: ReferencePickerProps) {
  const [tab, setTab] = useState<'works' | 'materials'>('works');
  const [works, setWorks] = useState<Work[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(
    new Set(initialWorkIds),
  );
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(
    new Set(initialMaterialIds),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        if (tab === 'works') {
          const url = new URL('/api/works', window.location.origin);
          if (searchQuery) url.searchParams.set('q', searchQuery);
          url.searchParams.set('limit', '50');
          const res = await fetch(url);
          if (res.ok) {
            const j = (await res.json()) as { items: Work[] };
            setWorks(j.items);
          }
        } else {
          const url = new URL('/api/materials', window.location.origin);
          const res = await fetch(url);
          if (res.ok) {
            const data = (await res.json()) as Material[];
            const filtered = searchQuery
              ? data.filter((m) =>
                  m.title.toLowerCase().includes(searchQuery.toLowerCase()),
                )
              : data;
            setMaterials(filtered);
          }
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [open, tab, searchQuery]);

  function toggleWork(id: string) {
    const next = new Set(selectedWorks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedWorks(next);
  }

  function toggleMaterial(id: string) {
    const next = new Set(selectedMaterials);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMaterials(next);
  }

  function handleConfirm() {
    onSelect({
      workIds: Array.from(selectedWorks),
      materialIds: Array.from(selectedMaterials),
    });
    onClose();
  }

  if (!open) return null;

  const totalSelected = selectedWorks.size + selectedMaterials.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">选择引用</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm hover:bg-muted"
          >
            ✕
          </button>
        </div>

        {/* Tab + 搜索 */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="flex gap-1">
            <button
              onClick={() => setTab('works')}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                tab === 'works'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              作品 {selectedWorks.size > 0 && `(${selectedWorks.size})`}
            </button>
            <button
              onClick={() => setTab('materials')}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                tab === 'materials'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              素材 {selectedMaterials.size > 0 && `(${selectedMaterials.size})`}
            </button>
          </div>
          <Input
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : tab === 'works' ? (
            <div className="space-y-2">
              {works.map((w) => {
                const selected = selectedWorks.has(w.id);
                return (
                  <div
                    key={w.id}
                    onClick={() => toggleWork(w.id)}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 transition-colors ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {w.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={w.coverUrl}
                        alt=""
                        className="h-12 w-20 shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">
                        {w.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {w.account.nickname} ·{' '}
                        {new Date(w.publishedAt).toLocaleDateString()}
                        {w.latestMetric &&
                          ` · 播放 ${w.latestMetric.play.toLocaleString()}`}
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
              })}
              {works.length === 0 && (
                <p className="text-sm text-muted-foreground">没有找到作品</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => {
                const selected = selectedMaterials.has(m.id);
                return (
                  <div
                    key={m.id}
                    onClick={() => toggleMaterial(m.id)}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 transition-colors ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {TYPE_LABELS[m.type] || m.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">
                        {m.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(m.createdAt).toLocaleDateString()}
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
              })}
              {materials.length === 0 && (
                <p className="text-sm text-muted-foreground">没有找到素材</p>
              )}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between border-t p-4">
          <div className="text-sm text-muted-foreground">
            已选 {totalSelected} 项
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleConfirm} disabled={totalSelected === 0}>
              确认引用
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
