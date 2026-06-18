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
  priority: 0,
  matchers,
  actions,
  ...overrides,
});

type Deps = Parameters<typeof createPatchedFetch>[0];

const createDeps = (overrides: Partial<Deps> = {}): Deps => ({
  originalFetch: vi.fn<typeof fetch>(),
  getRules: () => [],
  getGlobalEnabled: () => true,
  sink: () => undefined,
  delay: () => Promise.resolve(),
  ...overrides,
});

describe('createPatchedFetch mock (AC-002, TC-005)', () => {
  it('should serve a synthetic Response without calling the original fetch when a mock rule matches', async () => {
    const originalFetch = vi.fn<typeof fetch>();
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([
            {
              type: 'mock',
              status: 201,
              headers: [{ op: 'set', name: 'X-Mock', value: '1' }],
              body: '{"a":1}',
              contentType: 'application/json',
            },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res.status).toBe(201);
    expect(await res.text()).toBe('{"a":1}');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-mock')).toBe('1');
    expect(originalFetch).not.toHaveBeenCalled();
  });
});

describe('createPatchedFetch rewrite (AC-003, TC-006)', () => {
  it('should call the original fetch once and replace its body while preserving the original status', async () => {
    const originalFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{"original":true}', { status: 200 })),
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
  });
});

describe('createPatchedFetch passthrough (AC-004, TC-007)', () => {
  it('should return the exact original response reference and call the original fetch once when no rule matches', async () => {
    const original = new Response('untouched', { status: 200 });
    const originalFetch = vi.fn<typeof fetch>(() => Promise.resolve(original));
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [
          buildRule([{ type: 'mock', status: 500, headers: [], body: 'x' }], {
            url: { pattern: 'https://other.x/*', kind: 'glob' },
          }),
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
        getRules: () => [buildRule([{ type: 'mock', status: 500, headers: [], body: 'x' }])],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res).toBe(original);
    expect(originalFetch).toHaveBeenCalledTimes(1);
  });
});

describe('createPatchedFetch latency (AC-005, TC-008)', () => {
  it('should invoke the injected delay with latencyMs before resolving the mock response', async () => {
    const delay = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
    const fetchImpl = createPatchedFetch(
      createDeps({
        delay,
        getRules: () => [
          buildRule([{ type: 'mock', status: 200, headers: [], body: 'late', latencyMs: 250 }]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(delay).toHaveBeenCalledWith(250);
    expect(await res.text()).toBe('late');
  });
});

describe('createPatchedFetch Request-object input (AC-001, TC-009)', () => {
  it('should match a mock rule against the url of a Request object passed as input', async () => {
    const originalFetch = vi.fn<typeof fetch>();
    const fetchImpl = createPatchedFetch(
      createDeps({
        originalFetch,
        getRules: () => [buildRule([{ type: 'mock', status: 200, headers: [], body: 'from-request' }])],
      }),
    );

    const res = await fetchImpl(new Request('https://api.x/y'));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('from-request');
    expect(originalFetch).not.toHaveBeenCalled();
  });
});

describe('createPatchedFetch sink reporting (AC-007, TC-012)', () => {
  it('should report a served mock once with method, url, status and body', async () => {
    const reports: InterceptReport[] = [];
    const fetchImpl = createPatchedFetch(
      createDeps({
        sink: (report) => reports.push(report),
        getRules: () => [
          buildRule([
            {
              type: 'mock',
              status: 201,
              headers: [],
              body: '{"a":1}',
              contentType: 'application/json',
            },
          ]),
        ],
      }),
    );

    await fetchImpl('https://api.x/users', { method: 'POST' });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      kind: 'mock',
      method: 'POST',
      url: 'https://api.x/users',
      status: 201,
      body: '{"a":1}',
    });
  });

  it('should report a served rewrite once with the rewritten body and original status', async () => {
    const reports: InterceptReport[] = [];
    const fetchImpl = createPatchedFetch(
      createDeps({
        sink: (report) => reports.push(report),
        originalFetch: vi.fn<typeof fetch>(() => Promise.resolve(new Response('orig', { status: 200 }))),
        getRules: () => [buildRule([{ type: 'rewriteBody', body: 'new-body' }])],
      }),
    );

    await fetchImpl('https://api.x/users');

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ kind: 'rewrite', url: 'https://api.x/users', status: 200, body: 'new-body' });
  });
});

describe('createPatchedFetch header handling and input normalization', () => {
  it('should drop a header named by a remove op when serving a mock', async () => {
    const fetchImpl = createPatchedFetch(
      createDeps({
        getRules: () => [
          buildRule([
            {
              type: 'mock',
              status: 200,
              headers: [
                { op: 'set', name: 'X-Keep', value: 'yes' },
                { op: 'remove', name: 'X-Drop' },
              ],
              body: '{}',
              contentType: 'application/json',
            },
          ]),
        ],
      }),
    );

    const res = await fetchImpl('https://api.x/users');

    expect(res.headers.get('x-keep')).toBe('yes');
    expect(res.headers.get('x-drop')).toBeNull();
  });

  it('should match a mock against a URL object input and default the method to GET', async () => {
    const reports: InterceptReport[] = [];
    const fetchImpl = createPatchedFetch(
      createDeps({
        sink: (report) => reports.push(report),
        getRules: () => [buildRule([{ type: 'mock', status: 200, headers: [], body: 'url-input' }])],
      }),
    );

    const res = await fetchImpl(new URL('https://api.x/from-url'));

    expect(await res.text()).toBe('url-input');
    expect(reports[0]).toMatchObject({ method: 'GET', url: 'https://api.x/from-url' });
  });
});
