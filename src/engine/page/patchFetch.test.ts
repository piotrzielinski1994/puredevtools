// @vitest-environment node
// Runs in the node env, not jsdom: this file exercises pure request-plumbing
// (fetch/Request/Headers), and Vitest 4's jsdom-env compat Request wrapper drops
// method/headers when copying a Request that carries a body (it spreads {...init}),
// which the real browser and node's spec-compliant Request both preserve. The only
// DOM dependency is location.origin for relative-URL resolution, stubbed below to a
// fixed page origin (resolveUrl reads globalThis.location.href exactly as in a page).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Matchers, Rule, RuleAction } from '../../rules/model';
import type { InterceptReport } from './types';
import { createPatchedFetch } from './patchFetch';

const PAGE_ORIGIN = 'http://localhost:3000';
beforeAll(() => {
  vi.stubGlobal('location', { href: `${PAGE_ORIGIN}/`, origin: PAGE_ORIGIN });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

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
    const origin = location.origin;
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
    const origin = location.origin;
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

type FetchCall = Parameters<typeof fetch>;
const forwardedUrl = (call: FetchCall): string => {
  const [input] = call;
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
};
const forwardedHeaders = (call: FetchCall): Headers => {
  const [input, init] = call;
  const source = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  return new Headers(source);
};
const forwardedMethod = (call: FetchCall): string => {
  const [input, init] = call;
  if (init?.method) return init.method;
  if (input instanceof Request) return input.method;
  return 'GET';
};
const forwardedBody = (call: FetchCall): BodyInit | null | undefined => {
  const [, init] = call;
  return init?.body;
};

describe('createPatchedFetch pre-script (AC-006, AC-013)', () => {
  it('should forward the request carrying the pre-script url/method/header/body mutations (AC-006)', async () => {
    // behavior: a pre-script mutating req reshapes the forwarded fetch
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            {
              type: 'preScript',
              source:
                'req.setUrl("https://api.x/rerouted"); req.setMethod("PUT"); req.setHeader("x-test","1"); req.setBody("{\\"scripted\\":true}");',
            },
          ]),
        ],
      }),
    );

    await fetchImpl('https://api.x/users', { method: 'POST', body: '{"orig":true}' });

    expect(originalFetch).toHaveBeenCalledTimes(1);
    const call = originalFetch.mock.calls[0];
    expect(forwardedUrl(call)).toBe('https://api.x/rerouted');
    expect(forwardedMethod(call)).toBe('PUT');
    expect(forwardedHeaders(call).get('x-test')).toBe('1');
    expect(forwardedBody(call)).toBe('{"scripted":true}');
  });

  it('should run the pre-script after declarative request header ops so it observes the set value (AC-013)', async () => {
    // behavior: declarative modifyRequestHeaders applies first; the script reads that value via req.getHeader
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] },
            { type: 'preScript', source: 'req.setHeader("x-seen", req.getHeader("x-env") || "MISSING");' },
          ]),
        ],
      }),
    );

    await fetchImpl('https://api.x/users', { method: 'POST' });

    expect(originalFetch).toHaveBeenCalledTimes(1);
    const headers = forwardedHeaders(originalFetch.mock.calls[0]);
    expect(headers.get('x-env')).toBe('staging');
    expect(headers.get('x-seen')).toBe('staging');
  });

  it('should skip a throwing pre-script but still forward and let the post-script run (AC-010)', async () => {
    // behavior: a throwing pre-script is skipped (partial effect discarded) yet the
    // request is still forwarded and the pipeline proceeds to the post-script.
    // The post-script mutating the body is the feature-gated signal (RED until wired).
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'preScript', source: 'req.setHeader("x-partial","1"); throw new Error("pre boom");' },
            { type: 'postScript', source: 'res.setBody("recovered");' },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users', { method: 'POST' });

    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(forwardedHeaders(originalFetch.mock.calls[0]).get('x-partial')).toBeNull();
    expect(await res.text()).toBe('recovered');
  });
});

describe('createPatchedFetch post-script (AC-007)', () => {
  it('should apply post-script body and header mutations to the returned response (AC-007)', async () => {
    // behavior: a post-script reshapes the returned Response body + headers
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'postScript', source: 'res.setBody("changed"); res.setHeader("x-post","yes");' },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(await res.text()).toBe('changed');
    expect(res.headers.get('x-post')).toBe('yes');
  });

  it('should preserve the original status while the post-script reads it via getStatus (AC-007)', async () => {
    // behavior: getStatus returns the original status; the returned Response status is unchanged
    const originalFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('orig', { status: 201, statusText: 'Created' })),
    );
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([{ type: 'postScript', source: 'res.setHeader("x-seen-status", String(res.getStatus()));' }]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res.status).toBe(201);
    expect(res.headers.get('x-seen-status')).toBe('201');
  });

  it('should force the serve path for a post-script-only rule so the script sees the body (AC-007)', async () => {
    // behavior: a response-only post-script (no header/body override) still reads + serves the body
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig-body', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([{ type: 'postScript', source: 'res.setBody(res.getBody() + "-seen");' }]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(await res.text()).toBe('orig-body-seen');
  });

  it('should let the post-script observe the declarative body override (AC-013)', async () => {
    // behavior: declarative rewriteBody applies first; the post-script reads it via res.getBody
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'rewriteBody', body: 'declared' },
            { type: 'postScript', source: 'res.setBody(res.getBody() + "+scripted");' },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(await res.text()).toBe('declared+scripted');
  });

  it('should still serve the response when the post-script throws, skipping its effect (AC-010)', async () => {
    // behavior: a throwing post-script forces the serve path (sink fires - the
    // feature-gated signal) but its partial mutation is discarded (body stays 'orig').
    // A pre-feature passthrough would neither fire the sink nor force the serve path.
    const reports: InterceptReport[] = [];
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        sink: (report) => reports.push(report),
        getRules: () => [
          buildRule([{ type: 'postScript', source: 'res.setBody("half"); throw new Error("post boom");' }]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(reports).toHaveLength(1);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('orig');
  });
});

describe('createPatchedFetch script error logging (AC-010, AC-011)', () => {
  it('should log a prefixed error to the console when a pre-script throws (AC-010)', async () => {
    // side-effect-contract: a thrown pre-script surfaces a [puredevtools script] error line
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch: vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 }))),
        getRules: () => [buildRule([{ type: 'preScript', source: 'throw new Error("pre boom");' }])],
      }),
    );

    await fetchImpl('https://api.x/users');

    const logged = errorSpy.mock.calls.map((args) => args.join(' '));
    expect(logged.some((line) => line.includes('[puredevtools script]') && line.includes('pre boom'))).toBe(true);
    errorSpy.mockRestore();
  });

  it('should route a script console.log through to the page console prefixed (AC-011)', async () => {
    // side-effect-contract: console.log inside a script reaches the page console with the prefix
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch: vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 }))),
        getRules: () => [buildRule([{ type: 'preScript', source: 'console.log("hello from script");' }])],
      }),
    );

    await fetchImpl('https://api.x/users');

    const logged = logSpy.mock.calls.map((args) => args.join(' '));
    expect(logged.some((line) => line.includes('[puredevtools script]') && line.includes('hello from script'))).toBe(true);
    logSpy.mockRestore();
  });
});

const forwardedRequestBody = async (call: FetchCall): Promise<string | undefined> => {
  const [input, init] = call;
  if (typeof init?.body === 'string') return init.body;
  if (input instanceof Request) return input.clone().text();
  return undefined;
};

describe('createPatchedFetch url rewrite (AC-004, AC-006)', () => {
  it('should forward a rewrite-only request to the resolved new url while returning the original response (TC-009)', async () => {
    // behavior: an origin-swap rewrite reroutes the forward and passes the original response through
    const original = new Response('backend-body', { status: 201, statusText: 'Created' });
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(original));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [buildRule([{ type: 'rewriteRequestUrl', target: 'http://localhost:3000' }])],
      }),
    );

    const res = await fetchImpl('https://api.x/users?page=2');

    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(forwardedUrl(originalFetch.mock.calls[0])).toBe('http://localhost:3000/users?page=2');
    expect(res).toBe(original);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('backend-body');
  });

  it('should full-replace the forwarded path when the target carries an explicit path (TC-009)', async () => {
    // behavior: an explicit target path replaces the path and backfills the original query
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [buildRule([{ type: 'rewriteRequestUrl', target: 'http://localhost:3000/mock' }])],
      }),
    );

    await fetchImpl('https://api.x/users?page=2');

    expect(forwardedUrl(originalFetch.mock.calls[0])).toBe('http://localhost:3000/mock?page=2');
  });

  it('should preserve the method, headers and body of a Request-object input after the rewrite (TC-010)', async () => {
    // behavior: rewriting a Request input keeps its method/headers/body, only the url changes
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [buildRule([{ type: 'rewriteRequestUrl', target: 'http://localhost:3000' }])],
      }),
    );

    await fetchImpl(
      new Request('https://api.x/users', {
        method: 'POST',
        headers: { 'X-Token': 'abc' },
        body: '{"orig":true}',
      }),
    );

    expect(originalFetch).toHaveBeenCalledTimes(1);
    const call = originalFetch.mock.calls[0];
    expect(forwardedUrl(call)).toBe('http://localhost:3000/users');
    expect(forwardedMethod(call)).toBe('POST');
    expect(forwardedHeaders(call).get('x-token')).toBe('abc');
    expect(await forwardedRequestBody(call)).toBe('{"orig":true}');
  });

  it('should apply the declarative rewrite before the pre-script so the script observes it and its setUrl wins (TC-011)', async () => {
    // behavior: declarative rewrite runs first (the script sees the localhost url), then the
    // pre-script's setUrl wins. The script only emits the final url when it observed the rewrite,
    // so a wrong order (or a missing declarative rewrite) forwards to the sentinel instead.
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'rewriteRequestUrl', target: 'http://localhost:3000' },
            {
              type: 'preScript',
              source:
                'req.setUrl(req.getUrl() === "http://localhost:3000/users" ? "https://third.example/final" : "https://order.wrong/sentinel");',
            },
          ]),
        ],
      }),
    );

    await fetchImpl('https://api.x/users');

    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(forwardedUrl(originalFetch.mock.calls[0])).toBe('https://third.example/final');
  });
});

describe('createPatchedFetch url rewrite composition (AC-008)', () => {
  it('should forward to the new url with the request header set and serve the response header override (TC-015)', async () => {
    // behavior: rewrite + request-header set + response-header set compose in one rule
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            { type: 'rewriteRequestUrl', target: 'http://localhost:3000' },
            { type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] },
            { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Resp', value: 'on' }] },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users?page=2', { method: 'POST' });

    expect(originalFetch).toHaveBeenCalledTimes(1);
    const call = originalFetch.mock.calls[0];
    expect(forwardedUrl(call)).toBe('http://localhost:3000/users?page=2');
    expect(forwardedHeaders(call).get('x-env')).toBe('staging');
    expect(res.headers.get('x-resp')).toBe('on');
  });
});

describe('createPatchedFetch script re-entrancy (AC-009)', () => {
  it('should pass an inner fetch call through un-intercepted while a script is running (AC-009)', async () => {
    // behavior: the re-entrancy guard means a fetch made inside a pre-script does not
    // re-run the rule/script, so there is no infinite recursion.
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 })));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [buildRule([{ type: 'preScript', source: 'await fetch("https://api.x/inner");' }])],
      }),
    );
    const previousFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;

    try {
      const res = await fetchImpl('https://api.x/users');
      expect(res).toBeInstanceOf(Response);
      // outer forward + inner passthrough = 2; a broken guard would recurse without bound.
      expect(originalFetch).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
