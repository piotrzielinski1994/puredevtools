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
  delay: () => Promise.resolve(),
  ...overrides,
});

describe('createPatchedXhr mock (AC-006, TC-010)', () => {
  it('should serve a mock response without touching the network when a mock rule matches', async () => {
    const opened: Array<{ method: string; url: string }> = [];
    let instances = 0;

    class SpyXhr {
      constructor() {
        instances += 1;
      }
      open(method: string, url: string): void {
        opened.push({ method, url });
      }
      send(): void {
        throw new Error('network should not be used for a mock');
      }
    }

    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: SpyXhr as unknown as typeof XMLHttpRequest,
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

    const xhr = new Patched();
    const onload = vi.fn();
    xhr.onload = onload;
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(xhr.status).toBe(201);
    expect(xhr.responseText).toBe('{"a":1}');
    expect(xhr.getResponseHeader('content-type')).toBe('application/json');
    expect(instances).toBe(0);
    expect(opened).toHaveLength(0);
    expect(onload).toHaveBeenCalled();
  });

  it('should drive readyState/status through onreadystatechange for a matching mock rule', async () => {
    const Patched = createPatchedXhr(
      createDeps({
        getRules: () => [buildRule([{ type: 'mock', status: 200, headers: [], body: 'ok' }])],
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

    expect(states).toContain(4);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe('ok');
  });
});

describe('createPatchedXhr passthrough (AC-006, TC-011)', () => {
  it('should delegate open and send to the original XHR when no rule matches', async () => {
    const opened: Array<{ method: string; url: string }> = [];
    const sent: unknown[] = [];

    class FakeXhr {
      open(method: string, url: string): void {
        opened.push({ method, url });
      }
      send(body?: unknown): void {
        sent.push(body ?? null);
      }
      setRequestHeader(): void {}
    }

    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: FakeXhr as unknown as typeof XMLHttpRequest,
        getRules: () => [
          buildRule([{ type: 'mock', status: 500, headers: [], body: 'x' }], {
            url: { pattern: 'https://other.x/*', kind: 'glob' },
          }),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(opened).toEqual([{ method: 'GET', url: 'https://api.x/users' }]);
    expect(sent).toHaveLength(1);
  });

  it('should delegate to the original XHR when global interception is disabled', async () => {
    const opened: Array<{ method: string; url: string }> = [];
    const sent: unknown[] = [];

    class FakeXhr {
      open(method: string, url: string): void {
        opened.push({ method, url });
      }
      send(body?: unknown): void {
        sent.push(body ?? null);
      }
      setRequestHeader(): void {}
    }

    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: FakeXhr as unknown as typeof XMLHttpRequest,
        getGlobalEnabled: () => false,
        getRules: () => [buildRule([{ type: 'mock', status: 500, headers: [], body: 'x' }])],
      }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(opened).toEqual([{ method: 'GET', url: 'https://api.x/users' }]);
    expect(sent).toHaveLength(1);
  });

  it('should propagate the delegate response back to the consumer via onload and onreadystatechange', async () => {
    class FakeXhr {
      onreadystatechange: (() => void) | null = null;
      onload: ((event: ProgressEvent) => void) | null = null;
      onerror: ((event: ProgressEvent) => void) | null = null;
      readyState = 0;
      status = 0;
      responseText = '';
      response: unknown = '';
      open(): void {}
      setRequestHeader(): void {}
      send(): void {
        this.readyState = 4;
        this.status = 200;
        this.responseText = 'real-body';
        this.response = 'real-body';
        this.onreadystatechange?.();
        this.onload?.(new ProgressEvent('load'));
      }
    }

    const Patched = createPatchedXhr(
      createDeps({ OriginalXhr: FakeXhr as unknown as typeof XMLHttpRequest, getRules: () => [] }),
    );

    const xhr = new Patched();
    const states: number[] = [];
    const onload = vi.fn();
    xhr.onreadystatechange = (): void => {
      states.push(xhr.readyState);
    };
    xhr.onload = onload;
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(states).toContain(4);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe('real-body');
    expect(onload).toHaveBeenCalled();
  });
});

describe('createPatchedXhr mock extras', () => {
  it('should report the served mock through the sink with method, url, status and body', async () => {
    const reports: InterceptReport[] = [];
    const Patched = createPatchedXhr(
      createDeps({
        sink: (report) => reports.push(report),
        getRules: () => [buildRule([{ type: 'mock', status: 201, headers: [], body: '{"a":1}' }])],
      }),
    );

    const xhr = new Patched();
    xhr.open('POST', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ kind: 'mock', method: 'POST', url: 'https://api.x/users', status: 201, body: '{"a":1}' });
  });

  it('should delay a mock with latencyMs before resolving', async () => {
    const delay = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
    const Patched = createPatchedXhr(
      createDeps({
        delay,
        getRules: () => [buildRule([{ type: 'mock', status: 200, headers: [], body: 'late', latencyMs: 250 }])],
      }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(delay).toHaveBeenCalledWith(250);
    expect(xhr.responseText).toBe('late');
  });

  it('should expose custom mock headers via getResponseHeader and getAllResponseHeaders', async () => {
    const Patched = createPatchedXhr(
      createDeps({
        getRules: () => [
          buildRule([
            {
              type: 'mock',
              status: 200,
              headers: [
                { op: 'set', name: 'X-Mock', value: 'yes' },
                { op: 'remove', name: 'X-Drop' },
              ],
              body: '{}',
              contentType: 'application/json',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.send();

    await flush();

    expect(xhr.getResponseHeader('x-mock')).toBe('yes');
    expect(xhr.getResponseHeader('x-drop')).toBeNull();
    expect(xhr.getResponseHeader('content-type')).toBe('application/json');
    expect(xhr.getAllResponseHeaders()).toContain('x-mock: yes');
  });

  it('should forward setRequestHeader and abort to the delegate on passthrough', async () => {
    const headers: Array<{ name: string; value: string }> = [];
    let aborted = false;

    class FakeXhr {
      open(): void {}
      send(): void {}
      setRequestHeader(name: string, value: string): void {
        headers.push({ name, value });
      }
      abort(): void {
        aborted = true;
      }
    }

    const Patched = createPatchedXhr(
      createDeps({ OriginalXhr: FakeXhr as unknown as typeof XMLHttpRequest, getRules: () => [] }),
    );

    const xhr = new Patched();
    xhr.open('GET', 'https://api.x/users');
    xhr.setRequestHeader('X-Test', 'on');
    xhr.send();
    xhr.abort();

    expect(headers).toEqual([{ name: 'X-Test', value: 'on' }]);
    expect(aborted).toBe(true);
  });
});
