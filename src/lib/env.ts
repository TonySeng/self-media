import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres(ql):// URL'),
  MASTER_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'MASTER_KEY must be 64 hex chars (32 bytes)'),
  ADMIN_PASSWORD_HASH: z.string().min(20, 'ADMIN_PASSWORD_HASH must be a bcrypt hash'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be ≥ 32 chars'),
  STORAGE_TYPE: z.enum(['local', 'cos']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('./data/uploads'),
  COS_SECRET_ID: z.string().optional().default(''),
  COS_SECRET_KEY: z.string().optional().default(''),
  COS_BUCKET: z.string().optional().default(''),
  COS_REGION: z.string().optional().default(''),
  // Cron expression for the daily sync job. Defaults to 02:00 every day.
  // Validated at runtime by node-cron (see src/lib/cron/index.ts).
  SYNC_CRON: z.string().default('0 2 * * *'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      '❌ Invalid environment variables:',
      parsed.error.flatten().fieldErrors,
    );
    throw new Error('Invalid environment variables');
  }
  cached = parsed.data;
  return cached;
}
