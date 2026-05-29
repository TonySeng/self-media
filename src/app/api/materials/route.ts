import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { MaterialType, IdeaStatus } from '@prisma/client';

const CreateMaterialSchema = z.object({
  type: z.nativeEnum(MaterialType),
  title: z.string().min(1),
  content: z.string().optional(),
  fileKey: z.string().optional(),
  fileSize: z.number().int().positive().optional(),
  fileMime: z.string().optional(),
  url: z.string().url().optional(),
  ideaStatus: z.nativeEnum(IdeaStatus).optional(),
}).refine((data) => {
  if (data.type === MaterialType.COPY) {
    return data.content !== undefined && data.content.length > 0;
  }
  if (data.type === MaterialType.REFERENCE) {
    return data.url !== undefined;
  }
  if (data.type === MaterialType.VIDEO || data.type === MaterialType.AUDIO || data.type === MaterialType.IMAGE) {
    return data.fileKey !== undefined && data.fileSize !== undefined && data.fileMime !== undefined;
  }
  if (data.type === MaterialType.IDEA) {
    return data.ideaStatus !== undefined;
  }
  return true;
}, {
  message: 'COPY materials must have content; REFERENCE materials must have a url; VIDEO/AUDIO/IMAGE materials must have fileKey, fileSize, and fileMime; IDEA materials must have ideaStatus',
  path: ['type'],
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = CreateMaterialSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { type, title, content, fileKey, fileSize, fileMime, url, ideaStatus } = parsed.data;

  try {
    const material = await db.material.create({
      data: {
        type,
        title,
        content,
        fileKey,
        fileSize,
        fileMime,
        url,
        ideaStatus,
      },
    });

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'creation_failed', message: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as MaterialType | null;
  const ideaStatus = searchParams.get('ideaStatus') as IdeaStatus | null;

  const where: { type?: MaterialType; ideaStatus?: IdeaStatus } = {};
  if (type) {
    where.type = type;
  }
  if (ideaStatus) {
    where.ideaStatus = ideaStatus;
  }

  try {
    const materials = await db.material.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(materials);
  } catch (error) {
    return NextResponse.json(
      { error: 'query_failed', message: String(error) },
      { status: 500 }
    );
  }
}
