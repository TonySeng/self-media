import type { AutoReplyConfig } from './config';

/**
 * 自动回复失败时发送通知
 * § 3.1 支持邮件 + webhook 两种通知方式
 *
 * @param config 全局配置（含 notifyEmail 和 notifyWebhook）
 * @param accountNickname 账号昵称
 * @param reason 失败原因描述
 */
export async function notifyAutoReplyFailure(
  config: AutoReplyConfig,
  accountNickname: string,
  reason: string
): Promise<void> {
  const { notifyEmail, notifyWebhook } = config;

  // 如果两者都未配置，仅 console 记录
  if (!notifyEmail && !notifyWebhook) {
    console.warn(
      `[auto-reply/notify] No notification configured for failure: account="${accountNickname}", reason="${reason}"`
    );
    return;
  }

  // 邮件通知
  if (notifyEmail) {
    try {
      // TODO: 真实邮件实现（需集成 nodemailer 或类似库）
      console.warn(
        `[auto-reply/notify] TODO: Send email to "${notifyEmail}" - account="${accountNickname}", reason="${reason}"`
      );
    } catch (error) {
      console.error('[auto-reply/notify] Failed to send email:', error);
    }
  }

  // Webhook 通知
  if (notifyWebhook) {
    try {
      const payload = {
        event: 'auto_reply_failed',
        account: accountNickname,
        reason,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(notifyWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(
          `[auto-reply/notify] Webhook returned ${response.status}: ${await response.text()}`
        );
      }
    } catch (error) {
      console.error('[auto-reply/notify] Failed to POST webhook:', error);
    }
  }
}
