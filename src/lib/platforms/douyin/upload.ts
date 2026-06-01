import { chromium } from 'playwright';
import { UPLOAD_SELECTORS, UPLOAD_URL, PROGRESS_STALL_MS } from './selectors';
import type { PublishInput, PublishResult } from '@/lib/publish/types';
import * as path from 'node:path';
import * as fs from 'node:fs';

function parseCookies(raw: string, domain: string) {
  return raw.split(';').filter(Boolean).map(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return null;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    return { name, value, domain, path: '/' };
  }).filter(Boolean) as Array<{ name: string; value: string; domain: string; path: string }>;
}

export async function douyinPublish(input: PublishInput): Promise<PublishResult> {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  const screenshotDir = path.resolve(process.cwd(), 'data/screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `publish-${Date.now()}.png`);

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext();
    await context.addCookies(parseCookies(input.cookie, '.douyin.com'));
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    await page.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    if (page.url().includes('login')) {
      await page.screenshot({ path: screenshotPath });
      return { success: false, screenshotPath, error: 'Cookie 已失效，请重新导入' };
    }

    const captcha = page.locator(UPLOAD_SELECTORS.captchaModal).first();
    if (await captcha.isVisible().catch(() => false)) {
      await page.screenshot({ path: screenshotPath });
      return { success: false, screenshotPath, error: '触发风控验证，请手动处理后重试' };
    }

    const fileInput = page.locator(UPLOAD_SELECTORS.fileInput).first();
    await fileInput.waitFor({ state: 'attached', timeout: 15_000 });
    await fileInput.setInputFiles(input.videoPath);

    await page.locator(UPLOAD_SELECTORS.uploadComplete).waitFor({
      state: 'visible',
      timeout: PROGRESS_STALL_MS,
    });

    const titleInput = page.locator(UPLOAD_SELECTORS.titleInput).first();
    await titleInput.waitFor({ state: 'visible', timeout: 10_000 });
    await titleInput.fill('');
    await titleInput.fill(input.title);

    if (input.description) {
      const descInput = page.locator(UPLOAD_SELECTORS.descInput).first();
      await descInput.waitFor({ state: 'visible', timeout: 10_000 });
      await descInput.click();
      await descInput.fill(input.description);
    }

    if (input.coverPath) {
      const coverBtn = page.locator(UPLOAD_SELECTORS.coverButton).first();
      if (await coverBtn.isVisible().catch(() => false)) {
        await coverBtn.click();
        const coverInput = page.locator(UPLOAD_SELECTORS.coverFileInput).first();
        await coverInput.waitFor({ state: 'attached', timeout: 10_000 });
        await coverInput.setInputFiles(input.coverPath);
        const confirmBtn = page.locator(UPLOAD_SELECTORS.coverConfirm).first();
        await confirmBtn.waitFor({ state: 'visible', timeout: 10_000 });
        await confirmBtn.click();
      }
    }

    const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
    await publishBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await publishBtn.click();

    await page.locator(UPLOAD_SELECTORS.successIndicator).waitFor({
      state: 'visible',
      timeout: 30_000,
    });

    await page.screenshot({ path: screenshotPath });
    return { success: true, screenshotPath };
  } catch (e) {
    try {
      const pages = browser.contexts()[0]?.pages();
      if (pages?.[0]) await pages[0].screenshot({ path: screenshotPath });
    } catch {}
    return {
      success: false,
      screenshotPath,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await browser.close();
  }
}
