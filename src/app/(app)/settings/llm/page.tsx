'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProviderForm } from '@/components/llm/provider-form';
import { TestConnectionButton } from '@/components/llm/test-connection-button';
import { toast } from 'sonner';

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
};

type DefaultSetting = { providerId: string | null; model: string | null };

export default function LLMSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [adding, setAdding] = useState(false);

  async function loadAll() {
    const [pr, st] = await Promise.all([
      fetch('/api/llm/providers').then((r) => r.json() as Promise<Provider[]>),
      fetch('/api/llm/settings').then((r) => r.json() as Promise<DefaultSetting>),
    ]);
    setProviders(pr);
    setDefaultProviderId(st.providerId);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function createProvider(values: {
    name: string;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
  }) {
    const res = await fetch('/api/llm/providers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      toast.error('保存失败');
      return;
    }
    toast.success('已添加');
    setAdding(false);
    await loadAll();
  }

  async function updateProvider(
    id: string,
    values: { name: string; baseUrl: string; apiKey: string; defaultModel: string },
  ) {
    const body: Record<string, unknown> = {
      name: values.name,
      baseUrl: values.baseUrl,
      defaultModel: values.defaultModel,
    };
    if (values.apiKey) body.apiKey = values.apiKey;
    const res = await fetch(`/api/llm/providers/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error('保存失败');
      return;
    }
    toast.success('已保存');
    setEditing(null);
    await loadAll();
  }

  async function removeProvider(id: string) {
    if (!confirm('确认删除此 Provider？相关 AI 历史会一并删除。')) return;
    const res = await fetch(`/api/llm/providers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('已删除');
      await loadAll();
    }
  }

  async function setDefault(providerId: string) {
    const res = await fetch('/api/llm/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId }),
    });
    if (res.ok) {
      toast.success('默认 Provider 已设置');
      setDefaultProviderId(providerId);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">LLM Provider</h1>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          添加 Provider
        </Button>
      </div>

      {adding && (
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">新增 Provider</h2>
          <ProviderForm
            onSubmit={createProvider}
            onCancel={() => setAdding(false)}
            submitLabel="添加"
          />
        </Card>
      )}

      <div className="space-y-3">
        {providers.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            还没有配置任何 LLM Provider。点击右上角添加。
          </p>
        )}
        {providers.map((p) => (
          <Card key={p.id} className="space-y-3 p-4">
            {editing?.id === p.id ? (
              <ProviderForm
                initial={p}
                apiKeyOptional
                onSubmit={(v) => updateProvider(p.id, v)}
                onCancel={() => setEditing(null)}
                submitLabel="保存"
              />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    {defaultProviderId === p.id && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.baseUrl} · model: {p.defaultModel}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <TestConnectionButton providerId={p.id} />
                  {defaultProviderId !== p.id && (
                    <Button size="sm" variant="ghost" onClick={() => void setDefault(p.id)}>
                      设为默认
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void removeProvider(p.id)}>
                    删除
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
