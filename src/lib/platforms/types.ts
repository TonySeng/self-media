import type { Platform } from '@prisma/client';

export type StandardizedWork = {
  platformWorkId: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  duration: number | null;
  publishedAt: Date;
  rawData: unknown;
};

export type StandardizedWorkMetric = {
  platformWorkId: string;
  play: number;
  like: number;
  comment: number;
  share: number;
  collect: number;
  finishRate: number | null;
  rawData: unknown;
};

export type StandardizedAccountInfo = {
  nickname: string;
  avatar: string | null;
  secUid: string;
};

export type StandardizedAccountMetric = {
  totalFans: number;
  genderDist: unknown | null;
  ageDist: unknown | null;
  regionDist: unknown | null;
  rawData: unknown;
};

export type StandardizedComment = {
  platformCommentId: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  authorUid: string | null;
  likeCount: number;
  replyCount: number;
  publishedAt: Date;
  rawData: unknown;
};

export type CookieValidationResult =
  | { ok: true; account: StandardizedAccountInfo }
  | { ok: false; reason: 'expired' | 'invalid'; message: string };

export interface PlatformAdapter {
  readonly platform: Platform;
  validateCookie(cookie: string): Promise<CookieValidationResult>;
  fetchWorks(cookie: string, secUid: string): Promise<{
    works: StandardizedWork[];
    metrics: StandardizedWorkMetric[];
  }>;
  fetchWorkDetail(cookie: string, platformWorkId: string): Promise<{
    work: StandardizedWork;
    metric: StandardizedWorkMetric;
  }>;
  fetchAccountMetric(cookie: string, secUid: string): Promise<StandardizedAccountMetric>;
}
