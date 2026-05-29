import { describe, it, expect } from 'vitest';
import { parseCookieString, parseCookieJson, hasRequiredKeys } from '@/lib/platforms/douyin/cookie';

describe('parseCookieString', () => {
  it('parses semicolon-delimited cookie header', () => {
    const out = parseCookieString('sessionid_ss=abc; ttwid=xyz; foo=bar');
    expect(out).toEqual({ sessionid_ss: 'abc', ttwid: 'xyz', foo: 'bar' });
  });

  it('trims whitespace', () => {
    expect(parseCookieString('  a=1 ;b=2  ')).toEqual({ a: '1', b: '2' });
  });

  it('returns empty object for empty input', () => {
    expect(parseCookieString('')).toEqual({});
  });
});

describe('parseCookieJson', () => {
  it('accepts EditThisCookie-style array', () => {
    const json = JSON.stringify([
      { name: 'sessionid_ss', value: 'abc' },
      { name: 'ttwid', value: 'xyz' },
    ]);
    expect(parseCookieJson(json)).toEqual({ sessionid_ss: 'abc', ttwid: 'xyz' });
  });

  it('accepts plain {key:value} object', () => {
    expect(parseCookieJson('{"a":"1","b":"2"}')).toEqual({ a: '1', b: '2' });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseCookieJson('not-json')).toThrow();
  });
});

describe('hasRequiredKeys', () => {
  it('returns true when sessionid_ss present', () => {
    expect(hasRequiredKeys({ sessionid_ss: 'x', ttwid: 'y' })).toBe(true);
  });

  it('returns false when sessionid_ss missing', () => {
    expect(hasRequiredKeys({ ttwid: 'y' })).toBe(false);
  });

  it('returns false when sessionid_ss empty', () => {
    expect(hasRequiredKeys({ sessionid_ss: '' })).toBe(false);
  });
});
