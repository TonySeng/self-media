import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  __test__,
  calcMaxOutputTokens,
} from '@/lib/ai-tasks/copy-batch-gen';

const prisma = new PrismaClient();

describe('copy-batch-gen prompt assembly', () => {
  let benchmarkAccountId: string;
  let benchmarkWorkIds: string[] = [];
  let referenceAccountId: string;

  beforeAll(async () => {
    const ba = await prisma.benchmarkAccount.create({
      data: { platform: 'DOUYIN', nickname: '@测试对标', secUid: 'test-benchmark-secuid-' + Date.now() },
    });
    benchmarkAccountId = ba.id;
    const w1 = await prisma.benchmarkWork.create({
      data: {
        benchmarkAccountId: ba.id,
        title: '爆款标题1',
        description: '爆款描述1',
        play: 1_000_000,
        like: 50_000,
        comment: 2_000,
      },
    });
    const w2 = await prisma.benchmarkWork.create({
      data: {
        benchmarkAccountId: ba.id,
        title: '爆款标题2',
        play: 800_000,
        like: 30_000,
      },
    });
    benchmarkWorkIds = [w1.id, w2.id];

    const own = await prisma.platformAccount.create({
      data: {
        platform: 'DOUYIN',
        nickname: '我的账号',
        secUid: 'own-secuid-' + Date.now(),
        cookieEncrypted: 'encrypted-placeholder',
      },
    });
    referenceAccountId = own.id;
  });

  afterAll(async () => {
    await prisma.benchmarkWork.deleteMany({ where: { id: { in: benchmarkWorkIds } } });
    await prisma.benchmarkAccount.deleteMany({ where: { id: benchmarkAccountId } });
    await prisma.platformAccount.deleteMany({ where: { id: referenceAccountId } });
    await prisma.$disconnect();
  });

  it('builds prompt with only direction (no benchmarks, no style samples)', async () => {
    const { systemPrompt, userPrompt } = await __test__.preparePrompt({
      niche: '家居 vlog',
      direction: '推荐 3 件平价好物',
      count: 5,
    });
    expect(systemPrompt).toContain('短视频文案创作者');
    expect(userPrompt).toContain('账号定位：家居 vlog');
    expect(userPrompt).toContain('推荐 3 件平价好物');
    expect(userPrompt).toContain('需要生成数量：5 条');
    expect(userPrompt).toContain('（无对标参考）');
    expect(userPrompt).toContain('（无风格参考）');
    expect(userPrompt).toContain('请输出 5 条文案');
  });

  it('includes benchmark works when ids provided', async () => {
    const { userPrompt } = await __test__.preparePrompt({
      niche: '测试',
      direction: '测试方向',
      count: 3,
      benchmarkAccountId,
      benchmarkWorkIds,
    });
    expect(userPrompt).toContain('对标爆款（2 条）');
    expect(userPrompt).toContain('爆款标题1');
    expect(userPrompt).toContain('爆款标题2');
    expect(userPrompt).toContain('播放 1,000,000');
    expect(userPrompt).not.toContain('（无对标参考）');
  });

  it('skips benchmark works belonging to a different account (security)', async () => {
    const { userPrompt } = await __test__.preparePrompt({
      niche: '测试',
      direction: '测试方向',
      count: 3,
      benchmarkAccountId: 'non-existent-id',
      benchmarkWorkIds,
    });
    expect(userPrompt).toContain('（无对标参考）');
  });

  it('falls back when reference account has no high-engagement works', async () => {
    const { userPrompt } = await __test__.preparePrompt({
      niche: '测试',
      direction: '测试方向',
      count: 3,
      referenceAccountId,
    });
    expect(userPrompt).toContain('（无风格参考）');
  });

  it('calcMaxOutputTokens scales with count and caps at 8000', () => {
    expect(calcMaxOutputTokens(1)).toBe(900);
    expect(calcMaxOutputTokens(5)).toBe(2500);
    expect(calcMaxOutputTokens(10)).toBe(4500);
    expect(calcMaxOutputTokens(20)).toBe(8000);
    expect(calcMaxOutputTokens(100)).toBe(8000);
  });
});
