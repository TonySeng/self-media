import { db as prisma } from '@/lib/db';

// § 4.2 配置与状态类型定义
export type AutoReplyConfig = {
  enabled: boolean;
  cronExpr: string;
  fixedReply: string;
  blacklistKeywords: string[];
  perWorkLimit: number;
  perAccountDailyLimit: number;
  intervalMinSec: number;
  intervalMaxSec: number;
  notifyEmail: string;
  notifyWebhook: string;
};

export type AutoReplyAccountState = {
  tokenExpired: boolean;
  tokenExpiredAt: string | null;
  lastFailedAt: string | null;
  lastFailedReason: string | null;
  todayDate: string;
  todayCount: number;
};

// 默认配置
const DEFAULT_CONFIG: AutoReplyConfig = {
  enabled: false,
  cronExpr: '*/30 * * * *',
  fixedReply: '',
  blacklistKeywords: [],
  perWorkLimit: 10,
  perAccountDailyLimit: 10,
  intervalMinSec: 30,
  intervalMaxSec: 90,
  notifyEmail: '',
  notifyWebhook: '',
};

// 默认账号状态
const DEFAULT_ACCOUNT_STATE: AutoReplyAccountState = {
  tokenExpired: false,
  tokenExpiredAt: null,
  lastFailedAt: null,
  lastFailedReason: null,
  todayDate: new Date().toISOString().slice(0, 10),
  todayCount: 0,
};

/**
 * 从 Setting 表读取全局自动回复配置
 * 如未配置则返回默认值
 */
export async function loadAutoReplyConfig(): Promise<AutoReplyConfig> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'auto_reply_config' },
    });

    if (!setting) {
      return DEFAULT_CONFIG;
    }

    return { ...DEFAULT_CONFIG, ...(setting.value as Partial<AutoReplyConfig>) };
  } catch (error) {
    console.error('[auto-reply/config] Failed to load config:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 读取指定账号的自动回复状态
 * 如未配置则返回默认值
 */
export async function loadAccountState(accountId: string): Promise<AutoReplyAccountState> {
  const key = `auto_reply_state_${accountId}`;

  try {
    const setting = await prisma.setting.findUnique({
      where: { key },
    });

    if (!setting) {
      return DEFAULT_ACCOUNT_STATE;
    }

    return { ...DEFAULT_ACCOUNT_STATE, ...(setting.value as Partial<AutoReplyAccountState>) };
  } catch (error) {
    console.error(`[auto-reply/config] Failed to load state for account ${accountId}:`, error);
    return DEFAULT_ACCOUNT_STATE;
  }
}

/**
 * 保存指定账号的自动回复状态
 */
export async function saveAccountState(
  accountId: string,
  state: Partial<AutoReplyAccountState>
): Promise<void> {
  const key = `auto_reply_state_${accountId}`;

  try {
    const currentState = await loadAccountState(accountId);
    const newState = { ...currentState, ...state };

    await prisma.setting.upsert({
      where: { key },
      create: { key, value: newState },
      update: { value: newState },
    });
  } catch (error) {
    console.error(`[auto-reply/config] Failed to save state for account ${accountId}:`, error);
    throw error;
  }
}

/**
 * 标记账号的 token 已失效
 */
export async function setAccountTokenExpired(accountId: string, reason: string): Promise<void> {
  const now = new Date().toISOString();

  await saveAccountState(accountId, {
    tokenExpired: true,
    tokenExpiredAt: now,
    lastFailedAt: now,
    lastFailedReason: reason,
  });
}

