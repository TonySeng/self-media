import type { WorkComment } from '@prisma/client';

export type FilterResult = {
  pass: WorkComment[];
  skip: Array<WorkComment & { autoReplyError: string }>;
};

/**
 * 对评论列表应用黑名单过滤
 * § 3.1 纯函数，无副作用，可独立测试
 *
 * @param comments 待过滤的评论列表
 * @param blacklist 黑名单关键词数组
 * @returns { pass: 通过的评论, skip: 跳过的评论（附带原因） }
 */
export function filterComments(
  comments: WorkComment[],
  blacklist: string[]
): FilterResult {
  const pass: WorkComment[] = [];
  const skip: Array<WorkComment & { autoReplyError: string }> = [];

  // 预处理黑名单：全部转小写 + trim
  const normalizedBlacklist = blacklist.map((kw) => kw.toLowerCase().trim()).filter(Boolean);

  for (const comment of comments) {
    // 标准化评论内容
    const normalizedContent = comment.content.toLowerCase().trim();

    // 检测黑名单关键词（子串匹配）
    let matched: string | undefined;
    for (const keyword of normalizedBlacklist) {
      if (normalizedContent.includes(keyword)) {
        matched = keyword;
        break;
      }
    }

    if (matched) {
      skip.push({
        ...comment,
        autoReplyError: `blacklist:${matched}`,
      });
    } else {
      pass.push(comment);
    }
  }

  return { pass, skip };
}
