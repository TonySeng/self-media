import { NextResponse } from 'next/server';
import { getLLMClient } from '@/lib/llm/registry';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const start = Date.now();
  try {
    const client = await getLLMClient(id);
    const result = await client.generate({
      messages: [{ role: 'user', content: 'ping' }],
      maxOutputTokens: 8,
    });
    return NextResponse.json({
      ok: true,
      sample: result.text,
      usage: result.usage,
      latencyMs: Date.now() - start,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      message: message.slice(0, 500),
      latencyMs: Date.now() - start,
    });
  }
}
