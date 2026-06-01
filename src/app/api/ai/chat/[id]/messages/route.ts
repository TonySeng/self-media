import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeChatMessage } from '@/lib/ai-tasks/chat';

const MessageSchema = z.object({
  content: z.string().min(1).max(5000),
  attachments: z
    .object({
      workIds: z.array(z.string()).optional(),
      materialIds: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: chatId } = await params;
    const body = await req.json();
    const parsed = MessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await executeChatMessage(
      chatId,
      parsed.data.content,
      parsed.data.attachments,
    );

    return NextResponse.json({
      userMessage: {
        id: result.userMessage.id,
        role: result.userMessage.role,
        content: result.userMessage.content,
        attachments: result.userMessage.attachments,
        createdAt: result.userMessage.createdAt,
      },
      assistantMessage: {
        id: result.assistantMessage.id,
        role: result.assistantMessage.role,
        content: result.assistantMessage.content,
        tokensUsed: result.assistantMessage.tokensUsed,
        createdAt: result.assistantMessage.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'execution_failed', message },
      { status: 500 },
    );
  }
}
