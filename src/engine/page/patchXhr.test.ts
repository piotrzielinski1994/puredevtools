// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Matchers, Rule, RuleAction } from '../../rules/model';
import type { InterceptReport } from './types';
import { createPatchedXhr } from './patchXhr';

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

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type Deps = Parameters<typeof createPatchedXhr>[0];

const createDeps = (overrides: Partial<Deps> = {}): Deps => ({
  OriginalXhr: globalThis.XMLHttpRequest,
  getRules: () => [],
  getGlobalEnabled: () => true,
  sink: () => undefined,
  ...overrides,
});

const xhrClassReturning = (fake: FakeXhr): typeof XMLHttpRequest =>
  (class {
    constructor() {
      return fake;
    }
  }) as unknown as typeof XMLHttpRequest;

class FakeXhr {
  onreadystatechange: (() => void) | null = null;
  onload: ((event: ProgressEvent) => void) | null = null;
  onerror: ((event: ProgressEvent) => void) | null = null;
  readyState = 0;
  status = 0;
  responseText = '';
  response: unknown = '';
  openArgs: Array<{ method: string; url: string }> = [];
  sent: unknown[] = [];
  requestHeaders: Array<{ name: string; value: string }> = [];
  aborted = false;
  private responseHeaders: Record<string, string>;
  private realBody: string;
  private realStatus: number;

  constructor(realBody = 'real-body', realStatus = 200, responseHeaders: Record<string, string> = { 'x-real': 'yes' }) {
    this.realBody = realBody;
    this.realStatus = realStatus;
    this.responseHeaders = responseHeaders;
  }

  open(method: string, url: string): void {
    this.openArgs.push({ method, url });
  }
  setRequestHeader(name: string, value: string): void {
    this.requestHeaders.push({ name, value });
  }
  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  getAllResponseHeaders(): string {
    return Object.entries(this.responseHeaders)
      .map(([name, value]) => `${name}: ${value}`)
      .join('\r\n');
  }
  abort(): void {
    this.aborted = true;
  }
  send(body?: unknown): void {
    this.sent.push(body ?? null);
    this.readyState = 4;
    this.status = this.realStatus;
    this.responseText = this.realBody;
    this.response = this.realBody;
    this.onreadystatechange?.();
    this.onload?.(new ProgressEvent('load'));
  }
}

describe('createPatchedXhr body rewrite (AC-005)', () => {
  it('should forward the real request and rewrite responseText/response while preserving status', async () => {
    const fake = new FakeXhr('real-body', 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [buildRule([{ type: 'rewriteBody', body: '{"replaced":true}', contentType: 'application/json' }])],
      }),
    );

    const xhr = new Patched();
    const onload = vi.fn();
    xhr.onload = onload;
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(fake.sent).toHaveLength(1);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe('{"replaced":true}');
    expect(xhr.response).toBe('{"replaced":true}');
    expect(xhr.getResponseHeader('content-type')).toBe('application/json');
    expect(onload).toHaveBeenCalled();
  });
});

describe('createPatchedXhr header override (AC-005)', () => {
  it('should forward and apply set/remove header ops onto the real response headers', async () => {
    const fake = new FakeXhr('body', 200, { 'set-cookie': 'sid=1', 'x-old': 'keep' });
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
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

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(xhr.getResponseHeader('x-test')).toBe('on');
    expect(xhr.getResponseHeader('set-cookie')).toBeNull();
    expect(xhr.getResponseHeader('x-old')).toBe('keep');
    expect(xhr.getAllResponseHeaders()).toContain('x-test: on');
    expect(xhr.responseText).toBe('body');
  });
});

describe('createPatchedXhr passthrough (AC-006)', () => {
  it('should forward and expose the real response unchanged when no rule matches', async () => {
    const fake = new FakeXhr('real-body', 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([{ type: 'rewriteBody', body: 'x' }], { url: { pattern: 'https://other.x/*', kind: 'glob' } }),
        ],
      }),
    );

    const xhr = new Patched();
    const states: number[] = [];
    xhr.onreadystatechange = (): void => {
      states.push(xhr.readyState);
    };
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(fake.openArgs).toEqual([{ method: 'GET', url: 'https://api.x/users' }]);
    expect(states).toContain(4);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe('real-body');
  });

  it('should forward unchanged when global interception is disabled', async () => {
    const fake = new FakeXhr('real-body', 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getGlobalEnabled: () => false,
        getRules: () => [buildRule([{ type: 'rewriteBody', body: 'x' }])],
      }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(fake.sent).toHaveLength(1);
    expect(xhr.responseText).toBe('real-body');
  });
});

describe('createPatchedXhr plumbing', () => {
  it('should forward setRequestHeader and abort to the delegate', async () => {
    const fake = new FakeXhr();
    const Patched = createPatchedXhr(
      createDeps({ OriginalXhr: xhrClassReturning(fake), getRules: () => [] }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.setRequestHeader('X-Test', 'on');
    xhr.abort();

    expect(fake.requestHeaders).toEqual([{ name: 'X-Test', value: 'on' }]);
    expect(fake.aborted).toBe(true);
  });

  it('should preserve a non-200 real status when overriding the body (AC-005)', async () => {
    const fake = new FakeXhr('orig', 503);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [buildRule([{ type: 'rewriteBody', body: 'new' }])],
      }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(xhr.status).toBe(503);
    expect(xhr.responseText).toBe('new');
  });

  it('should not throw when a remove op targets an absent response header', async () => {
    const fake = new FakeXhr('body', 200, { 'x-present': 'yes' });
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [buildRule([{ type: 'modifyResponseHeaders', headers: [{ op: 'remove', name: 'X-Absent' }] }])],
      }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    expect(() => xhr.send()).not.toThrow();

    await flush();

    expect(xhr.getResponseHeader('x-present')).toBe('yes');
  });

  it('should let rewriteBody contentType win over a set content-type header op (edge case)', async () => {
    const fake = new FakeXhr('orig', 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'content-type', value: 'text/plain' }] },
            { type: 'rewriteBody', body: '{"x":1}', contentType: 'application/json' },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(xhr.getResponseHeader('content-type')).toBe('application/json');
  });

  it('should report a served override with kind rewrite, method, url, status, body and request meta', async () => {
    const reports: InterceptReport[] = [];
    const fake = new FakeXhr('orig', 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        sink: (report) => reports.push(report),
        getRules: () => [buildRule([{ type: 'rewriteBody', body: '{"a":1}' }])],
      }),
    );

    const xhr = new Patched();
    xhr.open('POST', 'https://api.x/users');
    xhr.setRequestHeader('X-Env', 'staging');
    xhr.send('{"q":1}');

    await flush();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      kind: 'rewrite',
      method: 'POST',
      url: 'https://api.x/users',
      status: 200,
      body: '{"a":1}',
    });
    expect(reports[0].requestHeaders).toMatchObject({ 'X-Env': 'staging' });
    expect(reports[0].requestBody).toBe('{"q":1}');
  });
});
