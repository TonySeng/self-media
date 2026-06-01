'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MaterialType } from '@prisma/client';

type Material = {
  id: string;
  type: MaterialType;
  title: string;
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
  const [materials, setMaterials] = useState<Material[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeType, setActiveType] = useState<MaterialType | 'ALL'>('ALL');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMaterials();
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, selectedTagId, searchQuery]);

  async function fetchMaterials() {
    const url = new URL('/api/materials', window.location.origin);
    if (activeType !== 'ALL') url.searchParams.set('type', activeType);
    if (selectedTagId) url.searchParams.set('tagId', selectedTagId);
    if (searchQuery) url.searchParams.set('q', searchQuery);

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

  if (activeType === 'IDEA') {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">素材库</h1>
          <Button>新建素材</Button>
        </div>
        <div className="text-sm text-muted-foreground">
          IDEA 看板视图将在 Task 15 中实现
        </div>
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
            <Button>新建素材</Button>
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
            <Card key={material.id} className="cursor-pointer transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle className="line-clamp-2">{material.title}</CardTitle>
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
                <div className="text-xs text-muted-foreground">
                  {new Date(material.createdAt).toLocaleDateString()}
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
      </main>
    </div>
  );
}
