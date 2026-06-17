import { describe, it, expect } from 'vitest';
import type { Matchers, Rule, RuleAction } from '../../rules/model';
import type {
  BeforeRequestDetails,
  BeforeSendHeadersDetails,
  BlockingResponse,
  HeadersReceivedDetails,
  HandlerDeps,
  StreamFilter,
} from './types';
import type { WebRequestApi } from './FirefoxEngine';
import { FirefoxEngine } from './FirefoxEngine';

type AnyListener = (details: never) => BlockingResponse | undefined;

type FakeEvent<D> = {
  addListener(listener: (details: D) => BlockingResponse | undefined, filter: { urls: string[] }, extra?: string[]): void;
  removeListener(listener: (details: D) => BlockingResponse | undefined): void;
  added: { listener: (details: D) => BlockingResponse | undefined; filter: { urls: string[] }; extra?: string[] }[];
  removed: ((details: D) => BlockingResponse | undefined)[];
};

const createFakeEvent = <D>(): FakeEvent<D> => {
  const added: FakeEvent<D>['added'] = [];
  const removed: FakeEvent<D>['removed'] = [];
  return {
    added,
    removed,
    addListener(listener, filter, extra) {
      added.push({ listener, filter, extra });
    },
    removeListener(listener) {
      removed.push(listener);
    },
  };
};

const createFakeWebRequest = (): WebRequestApi & {
  onBeforeRequest: FakeEvent<BeforeRequestDetails>;
  onBeforeSendHeaders: FakeEvent<BeforeSendHeadersDetails>;
  onHeadersReceived: FakeEvent<HeadersReceivedDetails>;
} => ({
  onBeforeRequest: createFakeEvent<BeforeRequestDetails>(),
  onBeforeSendHeaders: createFakeEvent<BeforeSendHeadersDetails>(),
  onHeadersReceived: createFakeEvent<HeadersReceivedDetails>(),
});

const createFakeFilter = (): StreamFilter => ({
  ondata: null,
  onstop: null,
  write() {},
  disconnect() {},
  close() {},
});

const createFakeDeps = (): HandlerDeps => ({
  filterResponseData: () => createFakeFilter(),
  delay: async () => undefined,
});

const buildRule = (
  actions: RuleAction[] = [{ type: 'block' }],
  matchers: Matchers = { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
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

const beforeRequestDetails = (): BeforeRequestDetails => ({
  requestId: 'req-1',
  url: 'https://api.example.com/v1/users',
  method: 'GET',
  type: 'xmlhttprequest',
  requestHeaders: [],
});

const allAddedListeners = (web: ReturnType<typeof createFakeWebRequest>): AnyListener[] => [
  ...web.onBeforeRequest.added.map((entry) => entry.listener as AnyListener),
  ...web.onBeforeSendHeaders.added.map((entry) => entry.listener as AnyListener),
  ...web.onHeadersReceived.added.map((entry) => entry.listener as AnyListener),
];

const allRemovedListeners = (web: ReturnType<typeof createFakeWebRequest>): AnyListener[] => [
  ...web.onBeforeRequest.removed.map((listener) => listener as AnyListener),
  ...web.onBeforeSendHeaders.removed.map((listener) => listener as AnyListener),
  ...web.onHeadersReceived.removed.map((listener) => listener as AnyListener),
];

describe('FirefoxEngine.capabilities (AC-001, TC-001)', () => {
  it('should report responseBodyRewrite as true', () => {
    const engine = new FirefoxEngine(createFakeWebRequest(), createFakeDeps());
    expect(engine.capabilities().responseBodyRewrite).toBe(true);
  });

  it('should report artificialLatency as true', () => {
    const engine = new FirefoxEngine(createFakeWebRequest(), createFakeDeps());
    expect(engine.capabilities().artificialLatency).toBe(true);
  });
});

describe('FirefoxEngine.apply (AC-009)', () => {
  it('should register a listener on onBeforeRequest', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule()], true);
    expect(web.onBeforeRequest.added).toHaveLength(1);
  });

  it('should register a listener on onBeforeSendHeaders', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule()], true);
    expect(web.onBeforeSendHeaders.added).toHaveLength(1);
  });

  it('should register a listener on onHeadersReceived', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule()], true);
    expect(web.onHeadersReceived.added).toHaveLength(1);
  });

  it('should register onBeforeRequest with an all_urls filter', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule()], true);
    expect(web.onBeforeRequest.added[0].filter.urls).toContain('<all_urls>');
  });

  it('should cancel a matching block request when globalEnabled is true', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule([{ type: 'block' }])], true);
    const listener = web.onBeforeRequest.added[0].listener;
    expect(listener(beforeRequestDetails())).toEqual({ cancel: true });
  });
});

describe('FirefoxEngine.apply globalEnabled false (AC-008, TC-009)', () => {
  it('should not act on a request that would match a block rule when globalEnabled is false', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule([{ type: 'block' }])], false);
    const listener = web.onBeforeRequest.added[0].listener;
    expect(listener(beforeRequestDetails())).toBeUndefined();
  });
});

describe('FirefoxEngine.clear (AC-009, TC-010)', () => {
  it('should remove every listener that was added', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule()], true);
    await engine.clear();
    expect(allRemovedListeners(web)).toHaveLength(allAddedListeners(web).length);
  });

  it('should remove the exact listener references that were added', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule()], true);
    await engine.clear();
    expect(new Set(allRemovedListeners(web))).toEqual(new Set(allAddedListeners(web)));
  });

  it('should re-register listeners after a clear when apply is called again', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule()], true);
    await engine.clear();
    await engine.apply([buildRule()], true);
    expect(web.onBeforeRequest.added).toHaveLength(2);
  });
});

describe('FirefoxEngine re-apply (AC-009)', () => {
  it('should remove the first set of listeners when apply is called twice', async () => {
    const web = createFakeWebRequest();
    const engine = new FirefoxEngine(web, createFakeDeps());
    await engine.apply([buildRule()], true);
    const firstSet = allAddedListeners(web);
    await engine.apply([buildRule()], true);
    const removed = new Set(allRemovedListeners(web));
    for (const listener of firstSet) {
      expect(removed.has(listener)).toBe(true);
    }
  });
});
