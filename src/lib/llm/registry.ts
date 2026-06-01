import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { createLLMClient } from './client';
import type { LLMClient } from './types';

export async function getLLMClient(providerId: string): Promise<LLMClient> {
  const row = await db.lLMProvider.findUniqueOrThrow({ where: { id: providerId } });
  if (!row.enabled) {
    throw new Error(`LLM provider ${row.name} is disabled`);
  }
  return createLLMClient({
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: decrypt(row.apiKeyEncrypted),
    defaultModel: row.defaultModel,
  });
}

export async function getDefaultLLMClient(): Promise<LLMClient> {
  const setting = await db.setting.findUnique({ where: { key: 'default_llm_provider' } });
  if (!setting?.value || typeof setting.value !== 'object') {
    throw new Error('Default LLM provider not configured. Set one in Settings → LLM.');
  }
  const { providerId } = setting.value as { providerId: string };
  if (typeof providerId !== 'string' || !providerId) {
    throw new Error('Default LLM provider misconfigured');
  }
  return getLLMClient(providerId);
}
