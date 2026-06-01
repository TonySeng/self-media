'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Work = {
  id: string;
  title: string;
  url: string | null;
  description: string | null;
  publishedAt: string | null;
  play: number | null;
  like: number | null;
  comment: number | null;
  share: number | null;
  collect: number | null;
  notes: string | null;
};

type Account = {
  id: string;
  nickname: string;
  niche: string | null;
  followers: number | null;
  url: string | null;
  notes: string | null;
  works: Work[];
};

export default function BenchmarkAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [account, setAccount] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    title: '',
    url: '',
    description: '',
    publishedAt: '',
    play: '',
    like: '',
    comment: '',
    share: '',
    collect: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/benchmark-accounts/${id}`);
    if (res.ok) {
      setAccount((await res.json()) as Account);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function handleAddWork() {
    if (!form.title.trim()) {
      toast.error('请填写作品标题');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/benchmark-works', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          benchmarkAccountId: id,
          title: form.title.trim(),
          url: form.url.trim() || undefined,
          description: form.description.trim() || undefined,
          publishedAt: form.publishedAt
            ? new Date(form.publishedAt).toISOString()
            : undefined,
          play: form.play ? Number(form.play) : undefined,
          like: form.like ? Number(form.like) : undefined,
          comment: form.comment ? Number(form.comment) : undefined,
          share: form.share ? Number(form.share) : undefined,
          collect: form.collect ? Number(form.collect) : undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '创建失败');
      }
      toast.success('作品已添加');
      setAdding(false);
      setForm({
        title: '',
        url: '',
        description: '',
        publishedAt: '',
        play: '',
        like: '',
        comment: '',
        share: '',
        collect: '',
        notes: '',
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteWork(workId: string) {
    if (!confirm('确认删除该作品？')) return;
    const res = await fetch(`/api/benchmark-works/${workId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      toast.success('已删除');
      await load();
    }
  }

  if (!account) return <p className="p-6 text-sm text-muted-foreground">加载中...</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/benchmark-accounts"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← 返回对标账号列表
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{account.nickname}</h1>
          <p className="text-xs text-muted-foreground">
            {account.niche && `${account.niche} · `}
            {account.followers != null &&
              `粉丝 ${account.followers.toLocaleString()}`}
          </p>
        </div>
        <Button onClick={() => setAdding(!adding)} disabled={adding}>
          录入作品
        </Button>
      </div>

      {adding && (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">录入对标作品</h2>
          <div className="space-y-1.5">
            <Label>标题 *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="作品标题"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>链接</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>发布时间</Label>
              <Input
                type="datetime-local"
                value={form.publishedAt}
                onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>描述/文案</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="作品描述、文案、Hook..."
              className="h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="space-y-1.5">
              <Label>播放</Label>
              <Input
                type="number"
                value={form.play}
                onChange={(e) => setForm({ ...form, play: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>点赞</Label>
              <Input
                type="number"
                value={form.like}
                onChange={(e) => setForm({ ...form, like: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>评论</Label>
              <Input
                type="number"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>分享</Label>
              <Input
                type="number"
                value={form.share}
                onChange={(e) => setForm({ ...form, share: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>收藏</Label>
              <Input
                type="number"
                value={form.collect}
                onChange={(e) => setForm({ ...form, collect: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>备注</Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="爆款分析、可学习的点..."
              className="h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddWork} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {account.works.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有录入作品。可在列表页点&ldquo;同步作品&rdquo;从抖音自动拉取，或在此页&ldquo;录入作品&rdquo;手动添加。
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              共 {account.works.length} 个作品（按发布时间倒序）。注意：抖音公开接口不返回他人作品的播放数（恒为
              0），但点赞/评论/分享/收藏数据正常。
            </p>
            {account.works.map((w) => (
            <Card key={w.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {w.url ? (
                      <a
                        href={w.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {w.title}
                      </a>
                    ) : (
                      w.title
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {w.play != null && <span>播 {w.play.toLocaleString()}</span>}
                    {w.like != null && <span>赞 {w.like.toLocaleString()}</span>}
                    {w.comment != null && (
                      <span>评 {w.comment.toLocaleString()}</span>
                    )}
                    {w.share != null && <span>分 {w.share.toLocaleString()}</span>}
                    {w.collect != null && (
                      <span>藏 {w.collect.toLocaleString()}</span>
                    )}
                    {w.publishedAt && (
                      <span>
                        发布于 {new Date(w.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {w.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {w.description}
                    </p>
                  )}
                  {w.notes && (
                    <p className="mt-1 text-xs text-primary">备注：{w.notes}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteWork(w.id)}
                >
                  删除
                </Button>
              </div>
            </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
