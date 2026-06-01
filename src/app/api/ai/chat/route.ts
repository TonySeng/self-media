import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  try {
    const chats = await db.aIChat.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    return NextResponse.json({
      items: chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messageCount: chat._count.messages,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'query_failed', message },
      { status: 500 },
    );
  }
}

export async function POST(): Promise<NextResponse> {
  try {
    const chat = await db.aIChat.create({
      data: {
        title: '新对话',
      },
    });

    return NextResponse.json(chat, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'creation_failed', message },
      { status: 500 },
    );
  }
}
