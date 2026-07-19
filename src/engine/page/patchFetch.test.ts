// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Matchers, Rule, RuleAction } from '../../rules/model';
import type { InterceptReport } from './types';
import { createPatchedFetch } from './patchFetch';

const buildRule = (
  actions: RuleAction[],
  matchers: Matchers = { url: { pattern: 'https://api.x/*', kind: 'glob' } },
  overrides: Partial<Rule> = {},
): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  matchers,
  actions,
  ...overrides,
});

type Deps = Parameters<typeof createPatchedFetch>[0];

const createDeps = (overrides: Partial<Deps> = {}): Deps => ({
  originalFetch: vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 }))),
  getRules: () => [],
  getGlobalEnabled: () => true,
  sink: () => undefined,
  ...overrides,
});

describe('createPatchedFetch body rewrite (AC-002)', () => {
  it('should forward the real request once and replace the body while preserving the original status', async () => {
    const originalFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{"original":true}', { status: 200, statusText: 'OK' })),
    );
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([{ type: 'rewriteBody', body: '{"replaced":true}', contentType: 'application/json' }]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('{"replaced":true}');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
  });
});

describe('createPatchedFetch header override (AC-003)', () => {
  it('should forward and apply set/remove header ops onto the original response headers', async () => {
    const originalFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('body', { status: 200, headers: { 'Set-Cookie': 'sid=1', 'X-Old': 'keep' } })),
    );
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            {
              type: 'modifyResponseHeaders',
              headers: [
                { op: 'set', name: 'X-Test', value: 'on' },
                { op: 'remove', name: 'Set-Cookie' },
              ],
            },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(res.headers.get('x-test')).toBe('on');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('x-old')).toBe('keep');
    expect(await res.text()).toBe('body');
  });
});

describe('createPatchedFetch combined override (AC-004)', () => {
  it('should apply both header ops and body rewrite when a rule carries both', async () => {
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Test', value: 'on' }] },
            { type: 'rewriteBody', body: 'new' },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res.headers.get('x-test')).toBe('on');
    expect(await res.text()).toBe('new');
  });
});

describe('createPatchedFetch passthrough (AC-006)', () => {
  it('should return the exact original response and forward once when no rule matches', async () => {
    const original = new Response('untouched', { status: 200 });
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(original));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([{ type: 'rewriteBody', body: 'x' }], { url: { pattern: 'https://other.x/*', kind: 'glob' } }),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res).toBe(original);
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });

  it('should pass through when global interception is disabled', async () => {
    const original = new Response('untouched', { status: 200 });
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(original));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getGlobalEnabled: () => false,
        getRules: () => [buildRule([{ type: 'rewriteBody', body: 'x' }])],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res).toBe(original);
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });
});

describe('createPatchedFetch request override (AC-003, AC-006, AC-007)', () => {
  it('should forward a modified init with the set request header and the replaced request body (TC-005)', async () => {
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] },
            { type: 'rewriteRequestBody', body: '{"q":2}' },
          ]),
        ],
      }),
    );

    await fetchImpl('https://api.x/users', { method: 'POST', body: '{"q":1}' });

    expect(originalFetch).toHaveBeenCalledTimes(1);
    const forwardedInit = originalFetch.mock.calls[0][1];
    expect(new Headers(forwardedInit?.headers).get('x-env')).toBe('staging');
    expect(forwardedInit?.body).toBe('{"q":2}');
  });

  it('should remove a request header present on the incoming init before forwarding (TC-006)', async () => {
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'remove', name: 'X-Secret' }] }]),
        ],
      }),
    );

    await fetchImpl('https://api.x/users', {
      method: 'POST',
      headers: { 'X-Secret': 'shh', 'X-Keep': 'yes' },
    });

    expect(originalFetch).toHaveBeenCalledTimes(1);
    const forwardedInit = originalFetch.mock.calls[0][1];
    const forwardedHeaders = new Headers(forwardedInit?.headers);
    expect(forwardedHeaders.get('x-secret')).toBeNull();
    expect(forwardedHeaders.get('x-keep')).toBe('yes');
  });

  it('should return the original response unchanged while forwarding the modified request for a request-only rule (TC-007)', async () => {
    const original = new Response('untouched', { status: 200 });
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(original));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] },
            { type: 'rewriteRequestBody', body: '{"q":2}' },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users', { method: 'POST', body: '{"q":1}' });

    expect(res).toBe(original);
    expect(await res.text()).toBe('untouched');
    expect(originalFetch).toHaveBeenCalledTimes(1);
    const forwardedInit = originalFetch.mock.calls[0][1];
    expect(new Headers(forwardedInit?.headers).get('x-env')).toBe('staging');
    expect(forwardedInit?.body).toBe('{"q":2}');
  });

  it('should forward the modified request and serve the overridden response when both request and response actions exist (TC-008)', async () => {
    const originalFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('orig', { status: 200 })),
    );
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] },
            { type: 'rewriteRequestBody', body: '{"req":true}' },
            { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Resp', value: 'on' }] },
            { type: 'rewriteBody', body: '{"resp":true}' },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users', { method: 'POST', body: '{"req":false}' });

    const forwardedInit = originalFetch.mock.calls[0][1];
    expect(new Headers(forwardedInit?.headers).get('x-env')).toBe('staging');
    expect(forwardedInit?.body).toBe('{"req":true}');
    expect(res.headers.get('x-resp')).toBe('on');
    expect(await res.text()).toBe('{"resp":true}');
  });
});

describe('createPatchedFetch input normalization (AC-001)', () => {
  it('should match a rule against the url of a Request object input', async () => {
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [buildRule([{ type: 'rewriteBody', body: 'from-request' }])],
      }),
    );

    const res = await fetchImpl(new Request('https://api.x/y'));

    expect(await res.text()).toBe('from-request');
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });

  it('should match against a URL object input and default the method to GET', async () => {
    const reports: InterceptReport[] = [];
    const fetchImpl = createPatchedFetch(
      createDeps({
        sink: (report) => reports.push(report),
        getRules: () => [buildRule([{ type: 'rewriteBody', body: 'url-input' }])],
      }),
    );

    const res = await fetchImpl(new URL('https://api.x/from-url'));

    expect(await res.text()).toBe('url-input');
    expect(reports[0]).toMatchObject({ method: 'GET', url: 'https://api.x/from-url' });
  });
});

describe('createPatchedFetch relative URL resolution', () => {
  it('should resolve a relative string input against the page origin before matching a full-URL rule', async () => {
    const origin = window.location.origin;
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([{ type: 'rewriteBody', body: 'resolved' }], {
            url: { pattern: `${origin}/base/makes`, kind: 'regex' },
          }),
        ],
      }),
    );

    const res = await fetchImpl('/base/makes?culture=en-CA');

    expect(await res.text()).toBe('resolved');
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });

  it('should report the resolved absolute url in the sink for a relative request', async () => {
    const origin = window.location.origin;
    const reports: InterceptReport[] = [];
    const fetchImpl = createPatchedFetch(
      createDeps({
        sink: (report) => reports.push(report),
        getRules: () => [
          buildRule([{ type: 'rewriteBody', body: 'ok' }], { url: { pattern: `${origin}/base/*`, kind: 'glob' } }),
        ],
      }),
    );

    await fetchImpl('/base/makes');

    expect(reports[0].url).toBe(`${origin}/base/makes`);
  });
});

describe('createPatchedFetch sink reporting (AC-009)', () => {
  it('should report a served override once with kind rewrite, method, url, status and body', async () => {
    const reports: InterceptReport[] = [];
    const fetchImpl = createPatchedFetch(
      createDeps({
        sink: (report) => reports.push(report),
        originalFetch: vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 }))),
        getRules: () => [buildRule([{ type: 'rewriteBody', body: 'new-body' }])],
      }),
    );

    await fetchImpl('https://api.x/users', { method: 'POST' });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      kind: 'rewrite',
      method: 'POST',
      url: 'https://api.x/users',
      status: 200,
      body: 'new-body',
    });
  });

  it('should report request headers and body from the init for a served override', async () => {
    const reports: InterceptReport[] = [];
    const fetchImpl = createPatchedFetch(
      createDeps({
        sink: (report) => reports.push(report),
        getRules: () => [buildRule([{ type: 'rewriteBody', body: 'ok' }])],
      }),
    );

    await fetchImpl('https://api.x/users', {
      method: 'POST',
      headers: { Authorization: 'Bearer abc', 'X-Env': 'staging' },
      body: '{"q":1}',
    });

    expect(reports[0].requestHeaders).toMatchObject({ authorization: 'Bearer abc', 'x-env': 'staging' });
    expect(reports[0].requestBody).toBe('{"q":1}');
  });
});

describe('createPatchedFetch edge cases', () => {
  it('should keep the original body when a header-only rule matches (no body rewrite)', async () => {
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('original-body', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [buildRule([{ type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X', value: 'y' }] }])],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(await res.text()).toBe('original-body');
  });

  it('should not throw when a remove op targets an absent header', async () => {
    const fetchImpl = createPatchedFetch(
      createDeps({
        getRules: () => [buildRule([{ type: 'modifyResponseHeaders', headers: [{ op: 'remove', name: 'X-Absent' }] }])],
      }),
    );

    await expect(fetchImpl('https://api.x/users')).resolves.toBeInstanceOf(Response);
  });

  it('should preserve a non-200 original status when overriding the body (AC-002)', async () => {
    const originalFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('orig', { status: 503, statusText: 'Service Unavailable' })),
    );
    const fetchImpl = createPatchedFetch(
      createDeps({ originalFetch, getRules: () => [buildRule([{ type: 'rewriteBody', body: 'new' }])] }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res.status).toBe(503);
    expect(await res.text()).toBe('new');
  });

  it('should let rewriteBody contentType win over a set content-type header op (edge case)', async () => {
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'content-type', value: 'text/plain' }] },
            { type: 'rewriteBody', body: '{"x":1}', contentType: 'application/json' },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res.headers.get('content-type')).toBe('application/json');
  });
});
