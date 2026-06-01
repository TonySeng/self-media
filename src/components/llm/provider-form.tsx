'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type ProviderFormValues = {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
};

export function ProviderForm({
  initial,
  apiKeyOptional = false,
  onSubmit,
  onCancel,
  submitLabel = '保存',
}: {
  initial?: Partial<ProviderFormValues>;
  apiKeyOptional?: boolean;
  onSubmit: (values: ProviderFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState(initial?.defaultModel ?? '');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ name, baseUrl, apiKey, defaultModel });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>名称</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Base URL</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>
          API Key
          {apiKeyOptional && (
            <span className="ml-1 text-xs text-muted-foreground">（留空保持不变）</span>
          )}
        </Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={apiKeyOptional ? '••••••••（不修改请留空）' : 'sk-...'}
          required={!apiKeyOptional}
        />
      </div>
      <div className="space-y-1.5">
        <Label>默认 Model</Label>
        <Input
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          placeholder="gpt-4 / claude-opus-4-7 / deepseek-chat"
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? '保存中…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
