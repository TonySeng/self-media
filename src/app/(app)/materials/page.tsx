'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MaterialType, IdeaStatus } from '@prisma/client';
import { PublishDialog } from '@/components/publish/publish-dialog';
import { MaterialFormDialog } from '@/components/materials/material-form-dialog';
import { IdeaBoard } from '@/components/materials/idea-board';

type Material = {
  id: string;
  type: MaterialType;
  title: string;
  content?: string | null;
  fileKey?: string | null;
  fileSize?: number | null;
  fileMime?: string | null;
  url?: string | null;
  ideaStatus?: IdeaStatus | null;
  createdAt: string;
  tags?: { id: string; name: string; color: string | null }[];
};

type Tag = {
  id: string;
  name: string;
  color: string | null;
  usageCount: number;
};

const TYPE_LABELS: Record<MaterialType | 'ALL', string> = {
  ALL: '全部',
  COPY: '文案',
  TOPIC: '选题',
  VIDEO: '视频',
  IMAGE: '图片',
  AUDIO: '音频',
  IDEA: '创意',
  REFERENCE: '参考',
};

export default function MaterialsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">加载中...</p>}>
      <MaterialsInner />
    </Suspense>
  );
}

function MaterialsInner() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeType, setActiveType] = useState<MaterialType | 'ALL'>('ALL');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [publishTarget, setPublishTarget] = useState<{ id: string; title: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [createType, setCreateType] = useState<MaterialType>('COPY');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const searchParams = useSearchParams();
  const accountId = searchParams.get('accountId') || '';

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMaterials();
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, selectedTagId, searchQuery, accountId]);

  async function fetchMaterials() {
    const url = new URL('/api/materials', window.location.origin);
    if (activeType !== 'ALL') url.searchParams.set('type', activeType);
    if (selectedTagId) url.searchParams.set('tagId', selectedTagId);
    if (searchQuery) url.searchParams.set('q', searchQuery);
    if (accountId) url.searchParams.set('accountId', accountId);

    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as Material[];
      setMaterials(data);
    }
  }

  async function fetchTags() {
    const res = await fetch('/api/materials/tags');
    if (res.ok) {
      const data = (await res.json()) as { tags: Tag[] };
      setTags(data.tags);
    }
  }

  async function deleteMaterial(id: string) {
    if (!confirm('确认删除该素材？')) return;
    const res = await fetch(`/api/materials/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchMaterials();
  }

  async function handleIdeaStatusChange(id: string, newStatus: IdeaStatus) {
    await fetch(`/api/materials/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaStatus: newStatus }),
    });
    await fetchMaterials();
  }

  if (activeType === 'IDEA') {
    const ideasWithStatus = materials
      .filter(
        (m): m is Material & { ideaStatus: IdeaStatus } =>
          m.ideaStatus !== null && m.ideaStatus !== undefined,
      )
      .map((m) => ({
        id: m.id,
        title: m.title,
        ideaStatus: m.ideaStatus,
        createdAt: m.createdAt,
        tags: m.tags ?? [],
      }));
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">创意看板</h1>
          <Button onClick={() => { setCreateType('IDEA'); setCreateDialogOpen(true); }}>
            新建创意
          </Button>
        </div>
        <IdeaBoard
          materials={ideasWithStatus}
          onStatusChange={handleIdeaStatusChange}
          onCardClick={() => {}}
        />
        <MaterialFormDialog
          open={createDialogOpen}
          onClose={() => { setCreateDialogOpen(false); void fetchMaterials(); }}
          type="IDEA"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full">
      <aside className="w-56 shrink-0 border-r bg-muted/30 p-4">
        <div className="mb-4 text-sm font-medium">标签筛选</div>
        <div className="space-y-1">
          <button
            onClick={() => setSelectedTagId(null)}
            className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
              selectedTagId === null
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            全部标签
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setSelectedTagId(tag.id)}
              className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                selectedTagId === tag.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{tag.name}</span>
                <span className="text-xs opacity-70">{tag.usageCount}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">素材库</h1>
          <div className="flex items-center gap-3">
            <Input
              placeholder="搜索标题"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-60"
            />
            <Button onClick={() => { setCreateType(activeType === 'ALL' ? 'COPY' : activeType); setCreateDialogOpen(true); }}>
              新建素材
            </Button>
          </div>
        </div>

        <div className="flex gap-2 border-b">
          {(['ALL', ...Object.values(MaterialType)] as const).map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeType === type
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {materials.map((material) => (
            <Card
              key={material.id}
              className="group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              onClick={() => setEditTarget(material)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="line-clamp-2 text-sm font-medium leading-snug">
                    {material.title}
                  </CardTitle>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {TYPE_LABELS[material.type]}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {(material.tags ?? []).map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: tag.color ? `${tag.color}20` : '#e5e7eb',
                        color: tag.color || '#6b7280',
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(material.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {material.type === 'VIDEO' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPublishTarget({ id: material.id, title: material.title });
                        }}
                      >
                        发布
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteMaterial(material.id);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {materials.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              暂无素材。点击&ldquo;新建素材&rdquo;开始添加。
            </p>
          )}
        </div>

        <PublishDialog
          open={!!publishTarget}
          onClose={() => setPublishTarget(null)}
          materialId={publishTarget?.id ?? ''}
          materialTitle={publishTarget?.title ?? ''}
        />

        <MaterialFormDialog
          open={createDialogOpen}
          onClose={() => { setCreateDialogOpen(false); void fetchMaterials(); }}
          type={createType}
        />

        {editTarget && (
          <MaterialFormDialog
            open={!!editTarget}
            onClose={() => { setEditTarget(null); void fetchMaterials(); }}
            type={editTarget.type}
            materialId={editTarget.id}
            initialData={{
              title: editTarget.title,
              content: editTarget.content ?? undefined,
              tags: (editTarget.tags ?? []).map((t) => t.name),
              fileKey: editTarget.fileKey ?? undefined,
              fileSize: editTarget.fileSize ?? undefined,
              fileMime: editTarget.fileMime ?? undefined,
              url: editTarget.url ?? undefined,
              ideaStatus: editTarget.ideaStatus ?? undefined,
            }}
          />
        )}
      </main>
    </div>
  );
}
