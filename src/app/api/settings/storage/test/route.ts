import { NextResponse } from 'next/server';
import { z } from 'zod';
import COS from 'cos-nodejs-sdk-v5';

const TestSchema = z.object({
  secretId: z.string().min(1),
  secretKey: z.string().min(1),
  bucket: z.string().min(1),
  region: z.string().min(1),
});

/**
 * POST /api/settings/storage/test
 * 测试 COS 连接
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = TestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const cos = new COS({
      SecretId: parsed.data.secretId,
      SecretKey: parsed.data.secretKey,
    });

    // 列出 Bucket 中的对象（最多 1 个）来测试连接
    const start = Date.now();
    await new Promise<void>((resolve, reject) => {
      cos.getBucket(
        {
          Bucket: parsed.data.bucket,
          Region: parsed.data.region,
          MaxKeys: 1,
        },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      ok: true,
      latencyMs,
      message: '连接成功',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      ok: false,
      message: message.slice(0, 200),
    });
  }
}
