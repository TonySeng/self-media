'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Account = { id: string; nickname: string; platform: string };

type Props = {
  open: boolean;
  onClose: () => void;
  materialId: string;
  materialTitle: string;
};

export function PublishDialog({ open, onClose, materialId, materialTitle }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [title, setTitle] = useState(materialTitle);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [publishId, setPublishId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(materialTitle);
      setPublishId(null);
      setStatus(null);
      setError(null);
      fetch('/api/settings/platforms')
        .then(r => r.json())
        .then(data => {
          const list = data.accounts || data.items || [];
          setAccounts(list);
          if (list.length > 0) setAccountId(list[0].id);
        })
        .catch(() => {});
    }
  }, [open, materialTitle]);

  useEffect(() => {
    if (!publishId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/publishes/${publishId}`);
      const data = await res.json();
      setStatus(data.status);
      if (data.status === 'DONE') {
        toast.success('发布成功');
        clearInterval(interval);
      } else if (data.status === 'FAILED') {
        setError(data.error || '发布失败');
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [publishId]);

  async function handleSubmit() {
    if (!accountId || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/publishes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platformAccountId: accountId,
          materialId,
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建发布任务失败');
      }
      const data = await res.json();
      setPublishId(data.id);
      setStatus('PENDING');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const statusLabels: Record<string, string> = {
    PENDING: '排队中...',
    RUNNING: '正在发布...',
    DONE: '发布成功',
    FAILED: '发布失败',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">发布到抖音</h2>

        {publishId ? (
          <div className="space-y-4">
            <p className="text-sm">{statusLabels[status || ''] || status}</p>
            {status === 'RUNNING' && (
              <div className="h-2 w-full overflow-hidden rounded bg-muted">
                <div className="h-full w-1/2 animate-pulse rounded bg-primary" />
              </div>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {(status === 'DONE' || status === 'FAILED') && (
              <Button onClick={onClose}>关闭</Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm">账号</label>
              <select
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.nickname}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm">标题</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
            </div>
            <div>
              <label className="mb-1 block text-sm">描述（支持 #话题 @提及）</label>
              <textarea
                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm"
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={5000}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={handleSubmit} disabled={submitting || !accountId || !title.trim()}>
                {submitting ? '提交中...' : '发布'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
