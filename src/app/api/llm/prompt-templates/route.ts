import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AIAnalysisType } from '@prisma/client';
import { db } from '@/lib/db';
import { DEFAULT_PROMPTS } from '@/lib/llm/default-prompts';

export async function GET(): Promise<NextResponse> {
  const customs = await db.promptTemplate.findMany();
  const customMap = new Map(customs.map((c) => [c.type, c]));
  const all = (Object.values(AIAnalysisType) as AIAnalysisType[]).map((type) => {
    const row = customMap.get(type);
    if (row) {
      return {
        id: row.id,
        type,
        systemPrompt: row.systemPrompt,
        userTemplate: row.userTemplate,
        isCustomized: true,
      };
    }
    const dflt = DEFAULT_PROMPTS[type];
    return {
      id: null,
      type,
      systemPrompt: dflt.systemPrompt,
      userTemplate: dflt.userTemplate,
      isCustomized: false,
    };
  });
  return NextResponse.json(all);
}

const PostBody = z.object({
  type: z.nativeEnum(AIAnalysisType),
  systemPrompt: z.string().min(1),
  userTemplate: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { type, systemPrompt, userTemplate } = parsed.data;
  const row = await db.promptTemplate.upsert({
    where: { type },
    create: { type, systemPrompt, userTemplate, isCustomized: true },
    update: { systemPrompt, userTemplate, isCustomized: true },
  });
  return NextResponse.json(row);
}
