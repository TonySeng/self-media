import { NextResponse } from 'next/server';
import { z } from 'zod';
import { request } from 'undici';
import { browserFetchJson } from '@/lib/platforms/douyin/signer';

/**
 * 通过 Cookie 调用抖音接口提取当前登录账号的 sec_uid
 *
 * 抖音的 IM info 接口 (`/aweme/v1/web/im/user/info/`) 在登录态下返回当前用户信息，
 * 无需签名（仅需 cookie），适合从浏览器 Cookie 自动获取 sec_uid。
 */
const Body = z.object({
  cookie: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { cookie: rawCookie } = parsed.data;

  // 清理 Cookie 字符串：移除 HTTP 头不允许的字符（CR/LF/non-printable）
  // undici 严格要求 Cookie 头只包含 visible ASCII (0x21-0x7E) + space + tab
  function sanitizeCookie(s: string): string {
    return s
      .split('; ')
      .map((part) => {
        const eq = part.indexOf('=');
        if (eq < 0) return null;
        const k = part.slice(0, eq).trim();
        const v = part.slice(eq + 1);
        // 仅保留 ASCII 可见字符
        const safeKey = k.replace(/[^!-~]/g, '');
        // 值: 直接移除非 ASCII 字符（避免 encodeURIComponent 在 unpaired surrogate 上崩溃）
        const safeVal = v.replace(/[^\x20-\x7E\t]/g, '');
        if (!safeKey || !safeVal) return null;
        return `${safeKey}=${safeVal}`;
      })
      .filter((x): x is string => x !== null)
      .join('; ');
  }

  const cookie = sanitizeCookie(rawCookie);

  // Debug: 输出 Cookie 字段统计
  const cookieStats = {
    rawLength: rawCookie.length,
    cleanedLength: cookie.length,
    keys: cookie.split('; ').map(p => p.split('=')[0]).join(','),
  };
  console.log('[extract-sec-uid] cookie stats:', cookieStats);

  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/130.0.0.0 Safari/537.36';

  // 尝试多个不需要签名的接口顺序：
  // 1. https://www.douyin.com/passport/web/account/info/   (统一身份接口)
  // 2. https://creator.douyin.com/web/api/media/user/info/   (创作者中心当前用户)
  // 3. 抖音首页 HTML 中的 RENDER_DATA
  const endpoints = [
    {
      url: 'https://www.douyin.com/aweme/v1/web/passport/account/info/',
      referer: 'https://www.douyin.com/',
      pickSecUid: (j: unknown) => {
        const o = j as { data?: { sec_uid?: string }; sec_uid?: string };
        return o?.data?.sec_uid ?? o?.sec_uid;
      },
      pickNickname: (j: unknown) => {
        const o = j as { data?: { name?: string; nickname?: string } };
        return o?.data?.nickname ?? o?.data?.name;
      },
    },
    {
      url: 'https://creator.douyin.com/web/api/media/user/info/',
      referer: 'https://creator.douyin.com/',
      pickSecUid: (j: unknown) => {
        const o = j as { user?: { sec_uid?: string }; sec_uid?: string; data?: { sec_uid?: string } };
        return o?.user?.sec_uid ?? o?.sec_uid ?? o?.data?.sec_uid;
      },
      pickNickname: (j: unknown) => {
        const o = j as { user?: { nickname?: string }; nickname?: string; data?: { nickname?: string } };
        return o?.user?.nickname ?? o?.nickname ?? o?.data?.nickname;
      },
    },
    {
      url: 'https://creator.douyin.com/web/api/creator/audit/auth_status/',
      referer: 'https://creator.douyin.com/',
      pickSecUid: (j: unknown) => {
        const o = j as { user?: { sec_uid?: string }; sec_uid?: string; data?: { sec_uid?: string; user?: { sec_uid?: string } } };
        return o?.user?.sec_uid ?? o?.sec_uid ?? o?.data?.sec_uid ?? o?.data?.user?.sec_uid;
      },
      pickNickname: () => undefined,
    },
  ];

  const debugLog: Array<{ url: string; status: number; preview: string }> = [];

  // 方案 A: 直接 undici fetch（更快，但 cookie 域受限）
  for (const ep of endpoints) {
    try {
      const res = await request(ep.url, {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Referer: ep.referer,
          Cookie: cookie,
          Accept: 'application/json, text/plain, */*',
        },
      });
      const text = await res.body.text();
      debugLog.push({ url: ep.url, status: res.statusCode, preview: text.slice(0, 200) });
      if (res.statusCode !== 200) continue;
      if (!text || text.trim() === '') continue;
      let json: unknown;
      try { json = JSON.parse(text); } catch { continue; }
      const secUid = ep.pickSecUid(json);
      const nickname = ep.pickNickname(json);
      if (secUid && typeof secUid === 'string' && secUid.startsWith('MS4wLjAB')) {
        return NextResponse.json({ secUid, nickname: nickname ?? null, source: ep.url });
      }
    } catch (e) {
      debugLog.push({ url: ep.url, status: -1, preview: e instanceof Error ? e.message : 'unknown' });
      continue;
    }
  }

  // 方案 B: 通过 Playwright 浏览器签名器，在真实 douyin.com 上下文中调用接口
  // 这样会自动注入 a_bogus / msToken / x-secsdk-web-signature 等签名，并使用 cookie 作为登录态
  try {
    const browserUrl = 'https://www.douyin.com/aweme/v1/web/im/spotlight/relation/?aid=6383';
    const browserResult = await browserFetchJson(browserUrl, cookie);
    debugLog.push({ url: 'browser:' + browserUrl, status: browserResult.status, preview: browserResult.body.slice(0, 300) });
    if (browserResult.body && browserResult.body.trim()) {
      try {
        const json = JSON.parse(browserResult.body) as {
          owner_sec_uid?: string;
          extra?: { fatal_item_ids?: unknown };
        };
        if (json.owner_sec_uid && json.owner_sec_uid.startsWith('MS4wLjAB')) {
          return NextResponse.json({ secUid: json.owner_sec_uid, nickname: null, source: 'browser:spotlight/relation' });
        }
      } catch { /* fall through */ }
    }
  } catch (e) {
    debugLog.push({ url: 'browser:spotlight/relation', status: -1, preview: e instanceof Error ? e.message : 'unknown' });
  }

  // 方案 B: 解析 www.douyin.com 首页 HTML 的 RENDER_DATA 注入数据
  // 登录用户访问首页时，HTML 中的 <script id="RENDER_DATA"> 包含当前用户的 sec_uid
  for (const homeUrl of ['https://www.douyin.com/', 'https://www.douyin.com/?recommend=1', 'https://creator.douyin.com/creator-micro/home']) {
    try {
      const res = await request(homeUrl, {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Referer: homeUrl,
          Cookie: cookie,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const html = await res.body.text();
      debugLog.push({ url: homeUrl + ' (HTML)', status: res.statusCode, preview: 'len=' + html.length });

      // 1. RENDER_DATA: <script id="RENDER_DATA" type="application/json">{...URL-encoded...}</script>
      const renderDataMatch = html.match(/<script[^>]+id="RENDER_DATA"[^>]*>([^<]+)<\/script>/);
      if (renderDataMatch) {
        try {
          const decoded = decodeURIComponent(renderDataMatch[1] ?? '');
          const m = decoded.match(/"sec_uid"\s*:\s*"(MS4wLjAB[A-Za-z0-9_-]+)"/);
          if (m) {
            const nm = decoded.match(/"nickname"\s*:\s*"([^"]+)"/);
            return NextResponse.json({ secUid: m[1], nickname: nm?.[1] ?? null, source: 'RENDER_DATA@' + homeUrl });
          }
        } catch { /* fall through */ }
      }

      // 2. 搜索原始 HTML 中所有 sec_uid（取第一个）
      const allMatches = html.match(/MS4wLjAB[A-Za-z0-9_-]{40,}/g);
      if (allMatches && allMatches.length > 0) {
        return NextResponse.json({
          secUid: allMatches[0],
          nickname: null,
          source: 'html-scan@' + homeUrl,
          warning: '通过 HTML 扫描提取',
        });
      }
    } catch (e) {
      debugLog.push({ url: homeUrl + ' (HTML)', status: -1, preview: e instanceof Error ? e.message : 'unknown' });
    }
  }

  return NextResponse.json(
    {
      error: 'all_endpoints_failed',
      message: '无法从 Cookie 提取 sec_uid，请确认 Cookie 中的登录会话有效',
      debug: debugLog,
    },
    { status: 502 },
  );
}
