import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';
import { clearStorageCache } from '@/lib/storage';

const COSConfigSchema = z.object({
  type: z.literal('cos'),
  cos: z.object({
    secretId: z.string().min(1),
    secretKey: z.string().optional(),
    bucket: z.string().min(1),
    region: z.string().min(1),
    cdnDomain: z.string().optional(),
  }),
});

const LocalConfigSchema = z.object({
  type: z.literal('local'),
});

const ConfigSchema = z.union([LocalConfigSchema, COSConfigSchema]);

/**
 * GET /api/settings/storage
 * 返回当前存储配置（不含敏感信息）
 */
export async function GET(): Promise<NextResponse> {
  try {
    const setting = await db.setting.findUnique({
      where: { key: 'storage_config' },
    });

    if (!setting?.value || typeof setting.value !== 'object') {
      return NextResponse.json({ type: 'local' });
    }

    const value = setting.value as Record<string, unknown>;
    if (value.type === 'cos' && value.cos && typeof value.cos === 'object') {
      const cos = value.cos as Record<string, unknown>;
      return NextResponse.json({
        type: 'cos',
        cos: {
          secretId:
            typeof cos.secretIdEncrypted === 'string'
              ? decrypt(cos.secretIdEncrypted)
              : '',
          secretKeyMasked: typeof cos.secretKeyEncrypted === 'string',
          bucket: cos.bucket,
          region: cos.region,
          cdnDomain: cos.cdnDomain,
        },
      });
    }

    return NextResponse.json({ type: 'local' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'query_failed', message },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/settings/storage
 * 更新存储配置
 */
export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = ConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    let valueToStore: Record<string, unknown>;

    if (parsed.data.type === 'cos') {
      const { secretId, secretKey, bucket, region, cdnDomain } =
        parsed.data.cos;

      // 如果未提供 secretKey，保留旧的
      let secretKeyEncrypted: string | undefined;
      if (secretKey) {
        secretKeyEncrypted = encrypt(secretKey);
      } else {
        const existing = await db.setting.findUnique({
          where: { key: 'storage_config' },
        });
        const existingValue = existing?.value as
          | Record<string, unknown>
          | undefined;
        const existingCos = existingValue?.cos as
          | Record<string, unknown>
          | undefined;
        if (typeof existingCos?.secretKeyEncrypted === 'string') {
          secretKeyEncrypted = existingCos.secretKeyEncrypted;
        } else {
          return NextResponse.json(
            { error: 'secret_key_required' },
            { status: 400 },
          );
        }
      }

      valueToStore = {
        type: 'cos',
        cos: {
          secretIdEncrypted: encrypt(secretId),
          secretKeyEncrypted,
          bucket,
          region,
          cdnDomain: cdnDomain || undefined,
        },
      };
    } else {
      valueToStore = { type: 'local' };
    }

    await db.setting.upsert({
      where: { key: 'storage_config' },
      create: {
        key: 'storage_config',
        value: valueToStore as Prisma.InputJsonValue,
      },
      update: {
        value: valueToStore as Prisma.InputJsonValue,
      },
    });

    clearStorageCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'update_failed', message },
      { status: 500 },
    );
  }
}
