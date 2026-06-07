import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { listComments } from './api';
import { parseCookieString } from './cookie';

export type CommentSyncResult = {
  workId: string;
  fetched: number;
  newCount: number;
  totalInDb: number;
};

/**
 * 同步指定作品的评论到数据库
 */
export async function syncWorkComments(
  workId: string,
  maxPages: number = 10,
): Promise<CommentSyncResult> {
  const work = await db.work.findUnique({
    where: { id: workId },
    include: { account: true },
  });

  if (!work) {
    throw new Error('Work not found');
  }

  const cookie = decrypt(work.account.cookieEncrypted);

  // 尝试从 cookie 提取 uid_tt 作为 ownerUid（用于标记作者回复）
  const cookieMap = parseCookieString(cookie);
  const ownerUid = cookieMap['uid_tt'] || undefined;

  // 评论列表接口需要 msToken / a_bogus 签名（与回复评论共用同一份）
  const signSetting = await db.setting.findUnique({
    where: { key: `reply_sign_${work.account.id}` },
  });
  let sign: { msToken: string; aBogus: string } | undefined;
  if (signSetting?.value && typeof signSetting.value === 'object') {
    const v = signSetting.value as { msToken?: string; aBogus?: string };
    if (v.msToken && v.aBogus) {
      sign = { msToken: v.msToken, aBogus: v.aBogus };
    }
  }
  if (!sign) {
    throw new Error(
      `账号 "${work.account.nickname}" 缺少评论签名，请到「设置 → 平台账号 → 回复签名」点「自动抓取签名」`,
    );
  }

  const fetched = await listComments(cookie, work.platformWorkId, maxPages, ownerUid, sign);

  let newCount = 0;

  for (const comment of fetched) {
    const result = await db.workComment.upsert({
      where: {
        workId_platformCommentId: {
          workId: work.id,
          platformCommentId: comment.platformCommentId,
        },
      },
      create: {
        workId: work.id,
        platformCommentId: comment.platformCommentId,
        parentCommentId: comment.parentCommentId,
        content: comment.content,
        authorName: comment.authorName,
        authorAvatar: comment.authorAvatar,
        authorUid: comment.authorUid,
        isAuthorReply: comment.isAuthorReply,
        likeCount: comment.likeCount,
        replyCount: comment.replyCount,
        publishedAt: comment.publishedAt,
        rawData: comment.rawData as object,
      },
      update: {
        content: comment.content,
        likeCount: comment.likeCount,
        replyCount: comment.replyCount,
        isAuthorReply: comment.isAuthorReply,
        rawData: comment.rawData as object,
      },
    });

    if (result.createdAt.getTime() > Date.now() - 5000) {
      newCount++;
    }
  }

  const totalInDb = await db.workComment.count({
    where: { workId: work.id },
  });

  return {
    workId: work.id,
    fetched: fetched.length,
    newCount,
    totalInDb,
  };
}
