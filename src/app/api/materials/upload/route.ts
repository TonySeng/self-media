import { NextResponse } from 'next/server';
import { MaterialType } from '@prisma/client';
import { getStorageProvider } from '@/lib/storage';

const MIME_RULES: Record<MaterialType, string[]> = {
  [MaterialType.VIDEO]: ['video/mp4', 'video/quicktime'],
  [MaterialType.IMAGE]: ['image/jpeg', 'image/png', 'image/webp'],
  [MaterialType.AUDIO]: ['audio/mpeg', 'audio/wav'],
  [MaterialType.COPY]: [],
  [MaterialType.TOPIC]: [],
  [MaterialType.IDEA]: [],
  [MaterialType.REFERENCE]: [],
};

const SIZE_LIMITS: Record<MaterialType, number> = {
  [MaterialType.VIDEO]: 100 * 1024 * 1024,
  [MaterialType.IMAGE]: 10 * 1024 * 1024,
  [MaterialType.AUDIO]: 20 * 1024 * 1024,
  [MaterialType.COPY]: 0,
  [MaterialType.TOPIC]: 0,
  [MaterialType.IDEA]: 0,
  [MaterialType.REFERENCE]: 0,
};

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const typeStr = formData.get('type') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
    }

    if (!typeStr) {
      return NextResponse.json({ error: 'Missing type field' }, { status: 400 });
    }

    const type = typeStr as MaterialType;
    const allowedMimes = MIME_RULES[type];

    if (!allowedMimes || allowedMimes.length === 0) {
      return NextResponse.json(
        { error: `Type ${type} does not support file upload` },
        { status: 400 }
      );
    }

    if (!allowedMimes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid MIME type for ${type}. Allowed: ${allowedMimes.join(', ')}` },
        { status: 400 }
      );
    }

    const sizeLimit = SIZE_LIMITS[type];
    if (file.size > sizeLimit) {
      return NextResponse.json(
        { error: `File size exceeds limit for ${type} (max: ${sizeLimit} bytes)` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = await getStorageProvider();
    const result = await storage.upload(buffer, file.name, type);
    const url = storage.getUrl(result.key);

    return NextResponse.json({
      key: result.key,
      size: result.size,
      mime: result.mimeType,
      url,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

