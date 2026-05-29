import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeUserInfo,
  normalizeWorkList,
  normalizeWorkDetail,
  normalizeFansAnalysis,
} from '@/lib/platforms/douyin/normalize';

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/douyin', name), 'utf8')) as unknown;

describe('normalizeUserInfo', () => {
  it('extracts secUid / nickname / avatar', () => {
    expect(normalizeUserInfo(fixture('user-info.json'))).toEqual({
      secUid: 'MS4wLjABAAAA_test_sec_uid',
      nickname: '测试昵称',
      avatar: 'https://example.com/avatar.jpg',
    });
  });

  it('throws on non-zero status_code', () => {
    expect(() => normalizeUserInfo({ status_code: 8, user: null })).toThrow();
  });
});

describe('normalizeWorkList', () => {
  it('returns parallel works/metrics arrays', () => {
    const out = normalizeWorkList(fixture('work-list.json'));
    expect(out.works).toHaveLength(1);
    expect(out.metrics).toHaveLength(1);
    expect(out.works[0]).toMatchObject({
      platformWorkId: '7300000000000000001',
      title: '示例作品标题',
      duration: 30000,
      coverUrl: 'https://example.com/cover.jpg',
    });
    expect(out.works[0]!.publishedAt).toBeInstanceOf(Date);
    expect(out.metrics[0]).toMatchObject({
      platformWorkId: '7300000000000000001',
      play: 1000,
      like: 100,
      comment: 10,
      share: 5,
      collect: 8,
    });
  });
});

describe('normalizeWorkDetail', () => {
  it('returns one work + one metric (with finishRate)', () => {
    const out = normalizeWorkDetail(fixture('work-detail.json'));
    expect(out.work.platformWorkId).toBe('7300000000000000001');
    expect(out.metric.finishRate).toBe(0.42);
  });
});

describe('normalizeFansAnalysis', () => {
  it('extracts total fans and distributions', () => {
    const out = normalizeFansAnalysis(fixture('fans-analysis.json'));
    expect(out.totalFans).toBe(12345);
    expect(out.genderDist).toBeTruthy();
    expect(out.ageDist).toBeTruthy();
    expect(out.regionDist).toBeTruthy();
  });
});
