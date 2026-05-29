export type CookieMap = Record<string, string>;

export function parseCookieString(raw: string): CookieMap {
  const out: CookieMap = {};
  if (!raw.trim()) return out;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export function parseCookieJson(raw: string): CookieMap {
  const data: unknown = JSON.parse(raw);
  if (Array.isArray(data)) {
    const out: CookieMap = {};
    for (const item of data) {
      if (
        item && typeof item === 'object' &&
        'name' in item && 'value' in item &&
        typeof item.name === 'string' && typeof item.value === 'string'
      ) {
        out[item.name] = item.value;
      }
    }
    return out;
  }
  if (data && typeof data === 'object') {
    const out: CookieMap = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }
  throw new Error('Cookie JSON must be an array or object');
}

export function serializeCookie(map: CookieMap): string {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

const REQUIRED = ['sessionid_ss'] as const;

export function hasRequiredKeys(map: CookieMap): boolean {
  return REQUIRED.every((k) => typeof map[k] === 'string' && map[k].length > 0);
}
