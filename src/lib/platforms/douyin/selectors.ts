export const UPLOAD_SELECTORS = {
  fileInput: 'input[type="file"][accept*="video"]',
  uploadProgress: '[class*="progress"]',
  uploadComplete: 'text=重新上传',
  titleInput: '[class*="title"] input',
  descInput: '[class*="desc"] [contenteditable="true"], [class*="description"] textarea',
  coverButton: 'text=更换封面',
  coverFileInput: 'input[type="file"][accept*="image"]',
  coverConfirm: 'text=完成',
  publishButton: 'button:has-text("发布")',
  successIndicator: 'text=发布成功',
  loginRedirect: 'text=登录, input[placeholder*="手机号"]',
  captchaModal: '[class*="captcha"], [class*="verify"]',
} as const;

export const UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
export const PROGRESS_STALL_MS = 60 * 1000;
