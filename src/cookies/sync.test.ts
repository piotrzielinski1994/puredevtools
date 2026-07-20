import { describe, it, expect, vi } from 'vitest';
import type { Cookies } from 'webextension-polyfill';
import type { CookieApiPort, CookieMapping } from './model';
import { syncMapping } from './sync';

const cookie = (over: Partial<Cookies.Cookie> = {}): Cookies.Cookie => ({
  name: 'auth',
  value: 'token-value',
  domain: '.prod.com',
  hostOnly: false,
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  session: false,
  expirationDate: 1893456000,
  storeId: '0',
  firstPartyDomain: '',
  ...over,
});

const mapping = (over: Partial<CookieMapping> = {}): CookieMapping => ({
  id: 'cm1',
  name: 'test',
  enabled: true,
  sourceUrl: 'https://app.prod.com',
  targetUrl: 'http://localhost:3000',
  cookieNames: ['auth'],
  ...over,
});

const makePort = (
  source: Cookies.Cookie[],
  setImpl?: CookieApiPort['set'],
): { port: CookieApiPort; getAll: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } => {
  const getAll = vi.fn(async () => source);
  const set = vi.fn(setImpl ?? (async (d: Cookies.SetDetailsType) => ({ ...cookie(), ...d }) as Cookies.Cookie));
  return { port: { getAll, set }, getAll, set };
};

describe('syncMapping', () => {
  it('should copy only the cookies named in the allow-list (TC-004)', async () => {
    const { port, set } = makePort([
      cookie({ name: 'auth' }),
      cookie({ name: 'sid' }),
      cookie({ name: 'ga' }),
    ]);

    const result = await syncMapping(mapping({ cookieNames: ['auth', 'sid'] }), port);

    expect(result.copied.sort()).toEqual(['auth', 'sid']);
    const setNames = set.mock.calls.map((c) => c[0].name);
    expect(setNames.sort()).toEqual(['auth', 'sid']);
    expect(setNames).not.toContain('ga');
  });

  it('should read source cookies using the source URL (TC-004)', async () => {
    const { port, getAll } = makePort([cookie()]);
    await syncMapping(mapping({ sourceUrl: 'https://app.prod.com/path' }), port);
    expect(getAll).toHaveBeenCalledWith({ url: 'https://app.prod.com/path' });
  });

  it('should report a requested name absent from source as skipped not-found (TC-005)', async () => {
    const { port, set } = makePort([cookie({ name: 'auth' })]);

    const result = await syncMapping(mapping({ cookieNames: ['auth', 'missing'] }), port);

    expect(result.copied).toEqual(['auth']);
    expect(result.skipped).toEqual([{ name: 'missing', reason: 'not-found' }]);
    expect(set.mock.calls.map((c) => c[0].name)).toEqual(['auth']);
  });

  it('should omit domain and copy value/path/httpOnly/sameSite/expirationDate to the target url (TC-006)', async () => {
    const { port, set } = makePort([
      cookie({
        name: 'auth',
        value: 'v',
        domain: '.prod.com',
        path: '/app',
        httpOnly: true,
        sameSite: 'strict',
        expirationDate: 1893456000,
      }),
    ]);

    await syncMapping(mapping({ targetUrl: 'https://staging.x.com' }), port);

    const details = set.mock.calls[0][0] as Cookies.SetDetailsType;
    expect(details.url).toBe('https://staging.x.com');
    expect(details.name).toBe('auth');
    expect(details.value).toBe('v');
    expect(details.path).toBe('/app');
    expect(details.httpOnly).toBe(true);
    expect(details.sameSite).toBe('strict');
    expect(details.expirationDate).toBe(1893456000);
    expect('domain' in details).toBe(false);
  });

  it('should drop the secure flag when the target url is http (TC-007)', async () => {
    const { port, set } = makePort([cookie({ secure: true })]);
    await syncMapping(mapping({ targetUrl: 'http://localhost:3000' }), port);
    expect((set.mock.calls[0][0] as Cookies.SetDetailsType).secure).toBe(false);
  });

  it('should preserve the secure flag when the target url is https (TC-008)', async () => {
    const { port, set } = makePort([cookie({ secure: true })]);
    await syncMapping(mapping({ targetUrl: 'https://staging.x.com' }), port);
    expect((set.mock.calls[0][0] as Cookies.SetDetailsType).secure).toBe(true);
  });

  it('should omit expirationDate for a session cookie', async () => {
    const { port, set } = makePort([cookie({ session: true, expirationDate: undefined })]);
    await syncMapping(mapping(), port);
    expect('expirationDate' in (set.mock.calls[0][0] as Cookies.SetDetailsType)).toBe(false);
  });

  it('should report a set failure as skipped set-rejected and continue with remaining cookies (TC-009)', async () => {
    const source = [cookie({ name: 'auth' }), cookie({ name: 'sid' })];
    const set = vi.fn(async (d: Cookies.SetDetailsType) => {
      if (d.name === 'auth') throw new Error('rejected');
      return { ...cookie(), ...d } as Cookies.Cookie;
    });
    const port: CookieApiPort = { getAll: async () => source, set };

    const result = await syncMapping(mapping({ cookieNames: ['auth', 'sid'] }), port);

    expect(result.copied).toEqual(['sid']);
    expect(result.skipped).toEqual([{ name: 'auth', reason: 'set-rejected' }]);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('should report a set returning null as skipped set-rejected (TC-009)', async () => {
    const set = vi.fn(async () => null);
    const port: CookieApiPort = { getAll: async () => [cookie({ name: 'auth' })], set };

    const result = await syncMapping(mapping({ cookieNames: ['auth'] }), port);

    expect(result.copied).toEqual([]);
    expect(result.skipped).toEqual([{ name: 'auth', reason: 'set-rejected' }]);
  });

  it('should copy nothing when the allow-list is empty (TC-010)', async () => {
    const { port, set } = makePort([cookie({ name: 'auth' })]);
    const result = await syncMapping(mapping({ cookieNames: [] }), port);
    expect(result.copied).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });

  it('should treat an unparseable target url as not secure and drop the secure flag (edge)', async () => {
    const { port, set } = makePort([cookie({ secure: true })]);
    await syncMapping(mapping({ targetUrl: 'not-a-url' }), port);
    expect((set.mock.calls[0][0] as Cookies.SetDetailsType).secure).toBe(false);
  });

  it('should set each source cookie sharing a name but differing by path (edge)', async () => {
    const { port, set } = makePort([
      cookie({ name: 'auth', path: '/' }),
      cookie({ name: 'auth', path: '/admin' }),
    ]);

    const result = await syncMapping(mapping({ cookieNames: ['auth'] }), port);

    expect(result.copied).toEqual(['auth', 'auth']);
    expect(set.mock.calls.map((c) => c[0].path).sort()).toEqual(['/', '/admin']);
  });
});
