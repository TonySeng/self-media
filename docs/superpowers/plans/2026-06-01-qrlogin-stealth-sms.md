# QRLogin Stealth + SMS Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace headless: false with stealth plugin + SMS verification code proxy so qrlogin works on headless servers.

**Architecture:** playwright-extra with stealth plugin replaces raw playwright for browser launch. Poll logic detects second_verification_web network requests to trigger SMS fallback. New /verify endpoint accepts user-submitted SMS code and fills it into the Playwright page.

**Tech Stack:** playwright-extra, puppeteer-extra-plugin-stealth, Next.js API routes, React (frontend dialog)

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install playwright-extra and stealth plugin**

```bash
pnpm add playwright-extra puppeteer-extra-plugin-stealth
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('playwright-extra'); require('puppeteer-extra-plugin-stealth'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add playwright-extra and stealth plugin for qrlogin"
```

---

### Task 2: Rewrite qrlogin.ts with stealth + SMS detection

**Files:**
- Modify: `src/lib/platforms/douyin/qrlogin.ts`

- [ ] **Step 1: Rewrite the full qrlogin module**

Replace `src/lib/platforms/douyin/qrlogin.ts` with:
