import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import { stat } from 'fs/promises';
import { getEnv } from '@/lib/env';

function getUploadsDir(): string {
  const configured = getEnv().LOCAL_STORAGE_PATH;
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
};

function getMimeType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  if (!path || path.length === 0) {
    return NextResponse.json({ error: 'Path required' }, { status: 400 });
  }

  const uploadsDir = getUploadsDir();
  const filePath = join(uploadsDir, ...path);

  if (!filePath.startsWith(uploadsDir)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 400 });
    }

    const buffer = await readFile(filePath);
    const filename = path[path.length - 1] || 'file';
    const mimeType = getMimeType(filename);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    console.error('Error serving upload:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
