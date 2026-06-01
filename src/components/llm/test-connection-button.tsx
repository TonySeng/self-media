'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function TestConnectionButton({ providerId }: { providerId: string }) {
  const [busy, setBusy] = useState(false);

  async function handleTest() {
    setBusy(true);
    try {
      const res = await fetch(`/api/llm/providers/${providerId}/test`, {
        method: 'POST',
      });
      const json = (await res.json()) as {
        ok: boolean;
        sample?: string;
        message?: string;
        latencyMs: number;
      };
      if (json.ok) {
        toast.success(
          `连接正常 (${json.latencyMs}ms): ${(json.sample ?? '').slice(0, 40)}`,
        );
      } else {
        toast.error(`连接失败: ${(json.message ?? '').slice(0, 200)}`);
      }
    } catch (e) {
      toast.error(`请求失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleTest} disabled={busy}>
      {busy ? '测试中…' : '测试连接'}
    </Button>
  );
}
