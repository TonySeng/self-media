'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MetricTrendChart } from '@/components/works/metric-trend-chart';
import { Markdown } from '@/components/ai/markdown';
import { parseSSEStream } from '@/lib/sse';
import { toast } from 'sonner';

type Detail = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  publishedAt: string;
  account: { nickname: string };
  metrics: Array<{
    snapshotAt: string;
    play: number;
    like: number;
    comment: number;
    share: number;
    collect: number;
    finishRate: number | null;
  }>;
};

type Comment = {
  id: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  likeCount: number;
  replyCount: number;
  publishedAt: string;
};

export default function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [syncingComments, setSyncingComments] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightResult, setInsightResult] = useState<string | null>(null);
  const [commentOrder, setCommentOrder] = useState<'publishedAt' | 'likeCount'>(
    'likeCount',
  );

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/works/${id}`);
      if (!res.ok) {
        setError('作品不存在');
        return;
      }
      setData((await res.json()) as Detail);
    })().catch((e: unknown) => setError(String(e)));
  }, [id]);

  async function loadComments() {
    const res = await fetch(`/api/works/${id}/comments?orderBy=${commentOrder}&limit=100`);
    if (res.ok) {
      const json = (await res.json()) as { items: Comment[] };
      setComments(json.items);
      setCommentsTotal(json.items.length);
    }
  }

  useEffect(() => {
    void loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, commentOrder]);

  async function handleSyncComments() {
    setSyncingComments(true);
    try {
      const res = await fetch(`/api/works/${id}/comments`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '同步失败');
      }
      const result = await res.json();
      toast.success(`同步完成：抓取 ${result.fetched} 条，新增 ${result.newCount} 条`);
      await loadComments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncingComments(false);
    }
  }

  async function handleCommentInsight() {
    setInsightLoading(true);
    setInsightResult('');
    try {
      const res = await fetch('/api/ai/comment-insight/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workId: id }),
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
          setInsightResult(fullText);
        } else if (event.type === 'finish') {
          setInsightResult(event.result);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
      toast.success('评论洞察完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '分析失败');
      setInsightResult(null);
    } finally {
      setInsightLoading(false);
    }
  }

  async function handleReview() {
    setReviewing(true);
    setReviewResult('');
    try {
      const res = await fetch('/api/ai/work-review/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workId: id }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'AI 分析失败');
      }

      type Event =
        | { type: 'text'; delta: string }
        | { type: 'finish'; result: string }
        | { type: 'error'; message: string };

      let fullText = '';
      for await (const event of parseSSEStream<Event>(res.body)) {
        if (event.type === 'text') {
          fullText += event.delta;
          setReviewResult(fullText);
        } else if (event.type === 'finish') {
          setReviewResult(event.result);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
      toast.success('AI 复盘完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 分析失败');
      setReviewResult(null);
    } finally {
      setReviewing(false);
    }
  }

  if (error) return <p className="p-6 text-sm text-red-500">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">加载中…</p>;

  const latest = data.metrics[data.metrics.length - 1];

  return (
    <div className="space-y-6 p-6">
      <div className="flex gap-4">
        {data.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.coverUrl} alt="" className="h-40 w-72 rounded-lg object-cover" />
        )}
        <div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <p className="text-xs text-muted-foreground">
            {data.account.nickname} · 发布于 {new Date(data.publishedAt).toLocaleString()}
          </p>
          {data.description && (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{data.description}</p>
          )}
        </div>
      </div>

      {latest && (
        <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
          <Stat label="播放" value={latest.play} />
          <Stat label="点赞" value={latest.like} />
          <Stat label="评论" value={latest.comment} />
          <Stat label="分享" value={latest.share} />
          <Stat label="收藏" value={latest.collect} />
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">AI 复盘</h2>
          <Button onClick={handleReview} disabled={reviewing} size="sm">
            {reviewing ? '分析中...' : '生成复盘'}
          </Button>
        </div>
        {reviewResult ? (
          <div className="rounded-md bg-muted p-3">
            <Markdown>{reviewResult}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            点击"生成复盘"按钮，AI 将基于作品数据生成复盘分析。
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-medium">数据趋势</h2>
        {data.metrics.length > 0 ? (
          <MetricTrendChart data={data.metrics} />
        ) : (
          <p className="text-sm text-muted-foreground">暂无快照数据。</p>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">
            评论 <span className="text-muted-foreground">({commentsTotal})</span>
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={commentOrder}
              onChange={(e) =>
                setCommentOrder(e.target.value as 'publishedAt' | 'likeCount')
              }
              className="rounded-md border bg-transparent px-2 py-1 text-xs outline-none"
            >
              <option value="likeCount">按点赞</option>
              <option value="publishedAt">按时间</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncComments}
              disabled={syncingComments}
            >
              {syncingComments ? '同步中...' : '同步评论'}
            </Button>
            <a href={`/api/export/comments?workId=${id}`} download>
              <Button size="sm" variant="outline" disabled={comments.length === 0}>
                导出 CSV
              </Button>
            </a>
            <Button
              size="sm"
              onClick={handleCommentInsight}
              disabled={insightLoading || comments.length === 0}
            >
              {insightLoading ? '分析中...' : 'AI 洞察'}
            </Button>
          </div>
        </div>

        {insightResult && (
          <div className="mb-3 rounded-md bg-muted p-3">
            <div className="mb-2 text-sm font-medium text-primary">AI 评论洞察</div>
            <Markdown>{insightResult}</Markdown>
          </div>
        )}

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无评论数据。点击"同步评论"按钮从抖音拉取评论。
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="border-b pb-2 last:border-b-0">
                <div className="flex items-start gap-2">
                  {c.authorAvatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.authorAvatar}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {c.authorName}
                      </span>
                      <span>·</span>
                      <span>{new Date(c.publishedAt).toLocaleString()}</span>
                      {c.likeCount > 0 && (
                        <>
                          <span>·</span>
                          <span>👍 {c.likeCount}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-sm">{c.content}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}
