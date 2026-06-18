import { describe, it, expect } from 'vitest';
import type { Matchers, Rule, RuleAction } from '../../rules/model';
import type {
  BeforeRequestDetails,
  BeforeSendHeadersDetails,
  BlockingResponse,
  BlockingResult,
  HeadersReceivedDetails,
  HandlerDeps,
  StreamFilter,
  WebRequestHeader,
} from './types';
import {
  buildBeforeSendHeaders,
  buildBeforeRequest,
  buildHeadersReceived,
} from './handlers';

const buildRule = (
  actions: RuleAction[],
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

const findHeader = (headers: WebRequestHeader[] | undefined, name: string): WebRequestHeader | undefined =>
  (headers ?? []).find((header) => header.name.toLowerCase() === name.toLowerCase());

const createFakeFilter = (): StreamFilter & {
  writes: Uint8Array[];
  disconnected: boolean;
  closed: boolean;
} => {
  const writes: Uint8Array[] = [];
  return {
    ondata: null,
    onstop: null,
    writes,
    disconnected: false,
    closed: false,
    write(data: Uint8Array) {
      writes.push(data);
    },
    disconnect() {
      this.disconnected = true;
    },
    close() {
      this.closed = true;
    },
  };
};

const createFakeDeps = (): HandlerDeps & { filter: ReturnType<typeof createFakeFilter> } => {
  const filter = createFakeFilter();
  return {
    filter,
    filterResponseData: () => filter,
    delay: async () => undefined,
  };
};

const sync = (result: BlockingResult): BlockingResponse | undefined => {
  if (result instanceof Promise) throw new Error('expected sync');
  return result;
};

const beforeSendDetails = (
  overrides: Partial<BeforeSendHeadersDetails> = {},
): BeforeSendHeadersDetails => ({
  url: 'https://api.example.com/v1/users',
  method: 'GET',
  type: 'xmlhttprequest',
  requestHeaders: [],
  ...overrides,
});

const beforeRequestDetails = (
  overrides: Partial<BeforeRequestDetails> = {},
): BeforeRequestDetails => ({
  requestId: 'req-1',
  url: 'https://api.example.com/v1/users',
  method: 'GET',
  type: 'xmlhttprequest',
  requestHeaders: [],
  ...overrides,
});

const headersReceivedDetails = (
  overrides: Partial<HeadersReceivedDetails> = {},
): HeadersReceivedDetails => ({
  url: 'https://api.example.com/v1/users',
  method: 'GET',
  type: 'xmlhttprequest',
  statusCode: 200,
  responseHeaders: [],
  ...overrides,
});

describe('buildBeforeSendHeaders (AC-002, TC-002)', () => {
  it('should append a header via set op if it does not already exist', () => {
    const handler = buildBeforeSendHeaders([
      buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Test', value: 'on' }] }]),
    ]);
    const result = handler(beforeSendDetails({ requestHeaders: [] }));
    expect(findHeader(result?.requestHeaders, 'X-Test')?.value).toBe('on');
  });

  it('should replace the value via set op if a header with the same name exists case-insensitively', () => {
    const handler = buildBeforeSendHeaders([
      buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Test', value: 'new' }] }]),
    ]);
    const result = handler(
      beforeSendDetails({ requestHeaders: [{ name: 'x-test', value: 'old' }] }),
    );
    const matching = (result?.requestHeaders ?? []).filter(
      (header) => header.name.toLowerCase() === 'x-test',
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].value).toBe('new');
  });

  it('should drop a header via remove op case-insensitively', () => {
    const handler = buildBeforeSendHeaders([
      buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'remove', name: 'Authorization' }] }]),
    ]);
    const result = handler(
      beforeSendDetails({ requestHeaders: [{ name: 'authorization', value: 'Bearer x' }] }),
    );
    expect(findHeader(result?.requestHeaders, 'Authorization')).toBeUndefined();
  });

  it('should return undefined if no rule matches the request', () => {
    const handler = buildBeforeSendHeaders([
      buildRule(
        [{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Test', value: 'on' }] }],
        { url: { pattern: 'https://other.example.com/*', kind: 'glob' } },
      ),
    ]);
    expect(handler(beforeSendDetails())).toBeUndefined();
  });

  it('should return undefined if the matched rule has no request-header action', () => {
    const handler = buildBeforeSendHeaders([buildRule([{ type: 'block' }])]);
    expect(handler(beforeSendDetails())).toBeUndefined();
  });

  it('should ignore disabled rules', () => {
    const handler = buildBeforeSendHeaders([
      buildRule(
        [{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Test', value: 'on' }] }],
        undefined,
        { enabled: false },
      ),
    ]);
    expect(handler(beforeSendDetails())).toBeUndefined();
  });

  it('should apply the first matching enabled rule when several match', () => {
    const handler = buildBeforeSendHeaders([
      buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Source', value: 'first' }] }]),
      buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Source', value: 'second' }] }]),
    ]);
    const result = handler(beforeSendDetails());
    expect(findHeader(result?.requestHeaders, 'X-Source')?.value).toBe('first');
  });
});

describe('buildBeforeRequest (AC-003, AC-004, TC-003, TC-004, TC-005)', () => {
  it('should cancel the request for a matching block rule', () => {
    const handler = buildBeforeRequest([buildRule([{ type: 'block' }])], createFakeDeps());
    expect(sync(handler(beforeRequestDetails()))).toEqual({ cancel: true });
  });

  it('should return the redirectUrl for a matching redirect rule', () => {
    const handler = buildBeforeRequest(
      [buildRule([{ type: 'redirect', url: 'https://elsewhere.example.com/' }])],
      createFakeDeps(),
    );
    expect(sync(handler(beforeRequestDetails()))?.redirectUrl).toBe('https://elsewhere.example.com/');
  });

  it('should rewrite the body in-flight for a matching mock rule keeping the original URL', () => {
    const deps = createFakeDeps();
    const handler = buildBeforeRequest(
      [
        buildRule([
          { type: 'mock', status: 200, headers: [], body: '{"mock":true}', contentType: 'application/json' },
        ]),
      ],
      deps,
    );
    const result = sync(handler(beforeRequestDetails()));
    expect(result).toBeUndefined();
    deps.filter.onstop?.();
    expect(new TextDecoder().decode(deps.filter.writes[0])).toBe('{"mock":true}');
    expect(deps.filter.closed).toBe(true);
  });

  it('should prefer block over redirect and mock within the same matching rule', () => {
    const handler = buildBeforeRequest(
      [
        buildRule([
          { type: 'redirect', url: 'https://elsewhere.example.com/' },
          { type: 'block' },
          { type: 'mock', status: 200, headers: [], body: 'x' },
        ]),
      ],
      createFakeDeps(),
    );
    expect(sync(handler(beforeRequestDetails()))).toEqual({ cancel: true });
  });

  it('should prefer redirect over mock when no block is present', () => {
    const handler = buildBeforeRequest(
      [
        buildRule([
          { type: 'mock', status: 200, headers: [], body: 'x' },
          { type: 'redirect', url: 'https://elsewhere.example.com/' },
        ]),
      ],
      createFakeDeps(),
    );
    expect(sync(handler(beforeRequestDetails()))?.redirectUrl).toBe('https://elsewhere.example.com/');
  });

  it('should use the first matching rule for the terminal action', () => {
    const handler = buildBeforeRequest(
      [
        buildRule([{ type: 'block' }]),
        buildRule([{ type: 'redirect', url: 'https://elsewhere.example.com/' }]),
      ],
      createFakeDeps(),
    );
    expect(sync(handler(beforeRequestDetails()))).toEqual({ cancel: true });
  });

  it('should return undefined if no block, redirect, or mock action applies', () => {
    const handler = buildBeforeRequest(
      [buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X', value: 'y' }] }])],
      createFakeDeps(),
    );
    expect(sync(handler(beforeRequestDetails()))).toBeUndefined();
  });

  it('should return undefined if no rule matches the request', () => {
    const handler = buildBeforeRequest(
      [buildRule([{ type: 'block' }], { url: { pattern: 'https://other.example.com/*', kind: 'glob' } })],
      createFakeDeps(),
    );
    expect(sync(handler(beforeRequestDetails()))).toBeUndefined();
  });

  it('should ignore disabled rules', () => {
    const handler = buildBeforeRequest(
      [buildRule([{ type: 'block' }], undefined, { enabled: false })],
      createFakeDeps(),
    );
    expect(sync(handler(beforeRequestDetails()))).toBeUndefined();
  });

  it('should delay the mocked body write by the configured latencyMs on stop', async () => {
    const delays: number[] = [];
    const fakeFilter = createFakeFilter();
    const deps: HandlerDeps = {
      filterResponseData: () => fakeFilter,
      delay: async (ms) => {
        delays.push(ms);
      },
    };
    const handler = buildBeforeRequest(
      [buildRule([{ type: 'mock', status: 200, headers: [], body: '{"m":1}', latencyMs: 250 }])],
      deps,
    );
    const result = sync(handler(beforeRequestDetails()));
    expect(result).toBeUndefined();
    fakeFilter.onstop?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(delays).toEqual([250]);
    expect(new TextDecoder().decode(fakeFilter.writes[0])).toBe('{"m":1}');
  });

  it('should attach a body rewrite to the response filter for a matching rewriteBody rule', () => {
    const fakeFilter = createFakeFilter();
    const requestIds: string[] = [];
    const deps: HandlerDeps = {
      filterResponseData: (requestId) => {
        requestIds.push(requestId);
        return fakeFilter;
      },
      delay: async () => undefined,
    };
    const handler = buildBeforeRequest(
      [buildRule([{ type: 'rewriteBody', body: '<p>new</p>', contentType: 'text/html' }])],
      deps,
    );
    const details = beforeRequestDetails();
    const result = sync(handler(details));
    expect(result).toBeUndefined();
    expect(requestIds).toEqual([details.requestId]);
    expect(typeof fakeFilter.onstop).toBe('function');
    fakeFilter.onstop?.();
    expect(fakeFilter.writes).toHaveLength(1);
    expect(new TextDecoder().decode(fakeFilter.writes[0])).toBe('<p>new</p>');
    expect(fakeFilter.closed).toBe(true);
  });

  it('should not call filterResponseData if no rewriteBody (or terminal) action matches', () => {
    let filterCalls = 0;
    const deps: HandlerDeps = {
      filterResponseData: () => {
        filterCalls += 1;
        return createFakeFilter();
      },
      delay: async () => undefined,
    };
    const handler = buildBeforeRequest(
      [buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Test', value: 'on' }] }])],
      deps,
    );
    const result = sync(handler(beforeRequestDetails()));
    expect(result).toBeUndefined();
    expect(filterCalls).toBe(0);
  });
});

describe('buildHeadersReceived (AC-005, TC-006)', () => {
  it('should append a response header via set op if absent', () => {
    const handler = buildHeadersReceived(
      [buildRule([{ type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Resp', value: 'on' }] }])],
      createFakeDeps(),
    );
    const result = handler(headersReceivedDetails({ responseHeaders: [] }));
    expect(findHeader(result?.responseHeaders, 'X-Resp')?.value).toBe('on');
  });

  it('should replace a response header value via set op case-insensitively', () => {
    const handler = buildHeadersReceived(
      [buildRule([{ type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'Content-Type', value: 'text/plain' }] }])],
      createFakeDeps(),
    );
    const result = handler(
      headersReceivedDetails({ responseHeaders: [{ name: 'content-type', value: 'application/json' }] }),
    );
    const matching = (result?.responseHeaders ?? []).filter(
      (header) => header.name.toLowerCase() === 'content-type',
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].value).toBe('text/plain');
  });

  it('should drop a response header via remove op case-insensitively', () => {
    const handler = buildHeadersReceived(
      [buildRule([{ type: 'modifyResponseHeaders', headers: [{ op: 'remove', name: 'Set-Cookie' }] }])],
      createFakeDeps(),
    );
    const result = handler(
      headersReceivedDetails({ responseHeaders: [{ name: 'set-cookie', value: 'a=b' }] }),
    );
    expect(findHeader(result?.responseHeaders, 'Set-Cookie')).toBeUndefined();
  });

  it('should return a statusLine containing the overridden status number', () => {
    const handler = buildHeadersReceived(
      [buildRule([{ type: 'setStatus', status: 503 }])],
      createFakeDeps(),
    );
    const result = handler(headersReceivedDetails());
    expect(result?.statusLine).toContain('503');
  });

  it('should return both responseHeaders and statusLine when a rule has header changes and a status override', () => {
    const handler = buildHeadersReceived(
      [
        buildRule([
          { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Resp', value: 'on' }] },
          { type: 'setStatus', status: 418 },
        ]),
      ],
      createFakeDeps(),
    );
    const result = handler(headersReceivedDetails());
    expect(findHeader(result?.responseHeaders, 'X-Resp')?.value).toBe('on');
    expect(result?.statusLine).toContain('418');
  });

  it('should set the mock status line and content-type header for a matching mock rule', () => {
    const handler = buildHeadersReceived(
      [buildRule([{ type: 'mock', status: 201, headers: [], body: '{"m":1}', contentType: 'application/json' }])],
      createFakeDeps(),
    );
    const result = handler(headersReceivedDetails());
    expect(result?.statusLine).toContain('201');
    expect(findHeader(result?.responseHeaders, 'Content-Type')?.value).toBe('application/json');
  });

  it('should apply custom mock response headers on top of the content-type', () => {
    const handler = buildHeadersReceived(
      [
        buildRule([
          {
            type: 'mock',
            status: 200,
            headers: [{ op: 'set', name: 'X-Mock', value: 'yes' }],
            body: '{}',
            contentType: 'application/json',
          },
        ]),
      ],
      createFakeDeps(),
    );
    const result = handler(headersReceivedDetails());
    expect(findHeader(result?.responseHeaders, 'X-Mock')?.value).toBe('yes');
    expect(findHeader(result?.responseHeaders, 'Content-Type')?.value).toBe('application/json');
  });

  it('should return undefined if no rule matches the request', () => {
    const handler = buildHeadersReceived(
      [buildRule([{ type: 'setStatus', status: 500 }], { url: { pattern: 'https://other.example.com/*', kind: 'glob' } })],
      createFakeDeps(),
    );
    expect(handler(headersReceivedDetails())).toBeUndefined();
  });

  it('should return undefined if the matched rule has no response action', () => {
    const handler = buildHeadersReceived([buildRule([{ type: 'block' }])], createFakeDeps());
    expect(handler(headersReceivedDetails())).toBeUndefined();
  });

  it('should ignore disabled rules', () => {
    const handler = buildHeadersReceived(
      [buildRule([{ type: 'setStatus', status: 500 }], undefined, { enabled: false })],
      createFakeDeps(),
    );
    expect(handler(headersReceivedDetails())).toBeUndefined();
  });
});
