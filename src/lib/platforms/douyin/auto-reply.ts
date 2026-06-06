import { db } from '@/lib/db';
import { postCommentReply } from './api';
import { sleep, randomDelayMs } from './http';
import { executeCommentReply } from '@/lib/ai-tasks/comment-reply';
import {
  loadAutoReplyConfig,
  loadAccountState,
  saveAccountState,
} from '@/lib/auto-reply/config';
import { filterComments } from '@/lib/auto-reply/filter';
import { notifyAutoReplyFailure } from '@/lib/auto-reply/notify';

export type AutoReplyResult = {
  accountId: string;
  repliedCount: number;
  skippedCount: number;
  failedReason: string | null;
};

/**
 * 为单个账号执行自动回复
 */
export async function autoReplyForAccount(accountId: string): Promise<AutoReplyResult> {
  const config = await loadAutoReplyConfig();

  if (!config.enabled) {
    return { accountId, repliedCount: 0, skippedCount: 0, failedReason: 'disabled' };
  }

  const state = await loadAccountState(accountId);

  // 跨天清零
  const today = new Date().toISOString().slice(0, 10);
  if (state.todayDate !== today) {
    state.todayDate = today;
    state.todayCount = 0;
  }

  // 检查 token 失效
  if (state.tokenExpired) {
    console.log(`[autoReplyForAccount] 账号 ${accountId} token 已失效，跳过`);
    return {
      accountId,
      repliedCount: 0,
      skippedCount: 0,
      failedReason: 'token_expired',
    };
  }

  // 检查今日配额
  if (state.todayCount >= config.perAccountDailyLimit) {
    console.log(`[autoReplyForAccount] 账号 ${accountId} 今日已达上限 ${config.perAccountDailyLimit}`);
    return {
      accountId,
      repliedCount: 0,
      skippedCount: 0,
      failedReason: 'daily_limit_reached',
    };
  }

  let repliedCount = 0;
  let skippedCount = 0;
  let failedReason: string | null = null;

  // 查询待回复评论：顶层 + 未处理 + 非作者
  const account = await db.platformAccount.findUnique({
    where: { id: accountId },
    include: {
      works: {
        include: {
          comments: {
            where: {
              parentCommentId: null,
              isAuthorReply: false,
              autoReplyStatus: null,
            },
            orderBy: { publishedAt: 'desc' },
          },
        },
      },
    },
  });

  if (!account) {
    throw new Error('账号不存在');
  }

  // 按 workId 分组，每组取前 perWorkLimit 条
  const commentsByWork = new Map<string, typeof account.works[0]['comments']>();
  for (const work of account.works) {
    if (work.comments.length > 0) {
      commentsByWork.set(
        work.id,
        work.comments.slice(0, config.perWorkLimit),
      );
    }
  }

  // 扁平化所有待处理评论
  const allComments = Array.from(commentsByWork.values()).flat();

  console.log(
    `[autoReplyForAccount] 账号 ${accountId} 待处理评论 ${allComments.length} 条`,
  );

  // 检查"作者已回过"：每条评论查子评论是否有 isAuthorReply=true
  const skippedIds = new Set<string>();
  for (const comment of allComments) {
    if (comment.replyCount > 0) {
      const hasAuthorReply = await db.workComment.findFirst({
        where: {
          workId: comment.workId,
          parentCommentId: comment.platformCommentId,
          isAuthorReply: true,
        },
      });

      if (hasAuthorReply) {
        await db.workComment.update({
          where: { id: comment.id },
          data: {
            autoReplyStatus: 'SKIPPED',
            autoReplyError: 'author_already_replied',
          },
        });
        skippedIds.add(comment.id);
        skippedCount++;
        continue;
      }
    }
  }

  // 过滤黑名单（排除已被标记的）
  const toProcess = allComments.filter((c) => !skippedIds.has(c.id));
  const { pass, skip } = filterComments(toProcess, config.blacklistKeywords);

  // 标记被黑名单过滤的
  for (const s of skip) {
    await db.workComment.update({
      where: { id: s.id },
      data: {
        autoReplyStatus: 'SKIPPED',
        autoReplyError: s.autoReplyError,
      },
    });
    skippedCount++;
  }

  for (const comment of pass) {
    const remaining = config.perAccountDailyLimit - state.todayCount;
    if (remaining <= 0) {
      console.log(`[autoReplyForAccount] 账号 ${accountId} 达到每日上限，停止`);
      break;
    }

    const work = account.works.find((w) => w.id === comment.workId);
    if (!work) continue;

    let replyText = config.fixedReply;

    // 固定回复为空则走 AI 生成
    if (!replyText || replyText.trim() === '') {
      try {
        const aiResult = await executeCommentReply(comment.id);
        replyText = aiResult.result;
      } catch (err) {
        console.error('[autoReplyForAccount] AI 生成失败:', err);
        await db.workComment.update({
          where: { id: comment.id },
          data: {
            autoReplyStatus: 'FAILED',
            autoReplyError: `AI 生成失败: ${err instanceof Error ? err.message : String(err)}`,
          },
        });
        // AI 失败不停账号，继续下一条
        continue;
      }
    }

    // 调用抖音回复接口
    try {
      await postCommentReply({
        accountId,
        awemeId: work.platformWorkId,
        commentId: comment.platformCommentId,
        text: replyText,
      });

      // 成功：更新评论状态
      await db.workComment.update({
        where: { id: comment.id },
        data: {
          autoReplyStatus: 'REPLIED',
          autoReplyContent: replyText,
          autoReplyAt: new Date(),
        },
      });

      state.todayCount++;
      repliedCount++;

      console.log(
        `[autoReplyForAccount] 成功回复评论 ${comment.id}，今日累计 ${state.todayCount}`,
      );

      // 保存状态
      await saveAccountState(accountId, state);

      // 随机延迟
      const delayMs = randomDelayMs(
        config.intervalMinSec * 1000,
        config.intervalMaxSec * 1000,
      );
      console.log(`[autoReplyForAccount] 延迟 ${delayMs}ms 后继续`);
      await sleep(delayMs);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[autoReplyForAccount] 回写失败:', reason);

      // 标记评论失败
      await db.workComment.update({
        where: { id: comment.id },
        data: {
          autoReplyStatus: 'FAILED',
          autoReplyError: reason,
        },
      });

      // 标记账号 token 失效，停止本轮
      state.tokenExpired = true;
      state.tokenExpiredAt = new Date().toISOString();
      state.lastFailedAt = new Date().toISOString();
      state.lastFailedReason = reason;
      await saveAccountState(accountId, state);

      failedReason = reason;

      try {
        const acc = await db.platformAccount.findUnique({
          where: { id: accountId },
          select: { nickname: true },
        });
        await notifyAutoReplyFailure(config, acc?.nickname ?? accountId, reason);
      } catch (notifyErr) {
        console.error('[autoReplyForAccount] notify failed:', notifyErr);
      }

      break;
    }
  }

  return {
    accountId,
    repliedCount,
    skippedCount,
    failedReason,
  };
}
