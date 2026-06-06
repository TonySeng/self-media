'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Tpl = {
  id: string | null;
  type: string;
  systemPrompt: string;
  userTemplate: string;
  isCustomized: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  WORK_REVIEW: '单作品复盘',
  TOPIC_SUGGEST: '选题建议',
  COPY_OPTIMIZE: '文案优化',
  WORKS_COMPARE: '横向对比',
  TREND: '趋势分析',
  COMMENT_INSIGHT: '评论洞察',
  COMMENT_REPLY: '评论回复',
  BENCHMARK: '对标分析',
};

export default function PromptsPage() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [activeType, setActiveType] = useState('WORK_REVIEW');
  const [system, setSystem] = useState('');
  const [user, setUser] = useState('');

  async function load() {
    const list = await fetch('/api/llm/prompt-templates').then(
      (r) => r.json() as Promise<Tpl[]>,
    );
    setTemplates(list);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const cur = templates.find((t) => t.type === activeType);
    if (cur) {
      setSystem(cur.systemPrompt);
      setUser(cur.userTemplate);
    }
  }, [activeType, templates]);

  async function save() {
    const res = await fetch('/api/llm/prompt-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: activeType,
        systemPrompt: system,
        userTemplate: user,
      }),
    });
    if (res.ok) {
      toast.success('已保存');
      await load();
    } else {
      toast.error('保存失败');
    }
  }

  async function reset() {
    const cur = templates.find((t) => t.type === activeType);
    if (!cur?.id) {
      toast.message('当前已是默认模板');
      return;
    }
    if (!confirm('恢复默认模板？此操作不可撤销。')) return;
    const res = await fetch(`/api/llm/prompt-templates/${cur.id}/reset`, {
      method: 'POST',
    });
    if (res.ok) {
      toast.success('已恢复默认');
      await load();
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Prompt 模板</h1>
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-3 p-2">
          <ul className="space-y-1">
            {templates.map((t) => (
              <li key={t.type}>
                <button
                  onClick={() => setActiveType(t.type)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${
                    activeType === t.type ? 'bg-muted' : ''
                  }`}
                >
                  <div>{TYPE_LABEL[t.type] ?? t.type}</div>
                  {t.isCustomized && (
                    <div className="text-xs text-primary">已自定义</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="col-span-9 space-y-3 p-4">
          <div className="space-y-1.5">
            <Label>System Prompt</Label>
            <textarea
              className="h-32 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={system}
              onChange={(e) => setSystem(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>User Template (用 {`{{var}}`} 占位)</Label>
            <textarea
              className="h-48 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()}>保存</Button>
            <Button variant="ghost" onClick={() => void reset()}>
              恢复默认
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
