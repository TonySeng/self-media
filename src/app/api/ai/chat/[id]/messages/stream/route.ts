import { z } from 'zod';
import { streamChatMessage } from '@/lib/ai-tasks/chat';
import { createSSEResponse } from '@/lib/sse';

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
): Promise<Response> {
  const { id: chatId } = await params;
  const body = await req.json();
  const parsed = MessageSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const generator = streamChatMessage(
    chatId,
    parsed.data.content,
    parsed.data.attachments,
  );

  return createSSEResponse(generator);
}
