import { describe, it, expect } from 'vitest';
import type { Matchers, Rule, RuleAction } from '../../rules/model';
import type { RequestDescriptor } from '../../rules/model';
import type { Interception } from './types';
import { decideInterception } from './decide';

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

const descriptor = (overrides: Partial<RequestDescriptor> = {}): RequestDescriptor => ({
  url: 'https://api.x/users',
  method: 'GET',
  resourceType: 'xmlhttprequest',
  ...overrides,
});

const isMock = (
  interception: Interception,
): interception is Extract<Interception, { kind: 'mock' }> => interception.kind === 'mock';

const isRewrite = (
  interception: Interception,
): interception is Extract<Interception, { kind: 'rewrite' }> => interception.kind === 'rewrite';

describe('decideInterception (AC-001)', () => {
  it('should return a mock interception mapped from the action if an enabled mock rule matches (TC-001)', () => {
    const rule = buildRule([
      {
        type: 'mock',
        status: 201,
        headers: [{ op: 'set', name: 'X-Mock', value: '1' }],
        body: '{"a":1}',
        contentType: 'application/json',
        latencyMs: 50,
      },
    ]);
    const result = decideInterception([rule], descriptor(), true);
    expect(isMock(result)).toBe(true);
    if (!isMock(result)) throw new Error('expected mock');
    expect(result.status).toBe(201);
    expect(result.body).toBe('{"a":1}');
    expect(result.contentType).toBe('application/json');
    expect(result.headers).toEqual([{ op: 'set', name: 'X-Mock', value: '1' }]);
    expect(result.latencyMs).toBe(50);
  });

  it('should return a rewrite interception mapped from the action if an enabled rewriteBody rule matches (TC-002)', () => {
    const rule = buildRule([{ type: 'rewriteBody', body: '<p>new</p>', contentType: 'text/html' }]);
    const result = decideInterception([rule], descriptor(), true);
    expect(isRewrite(result)).toBe(true);
    if (!isRewrite(result)) throw new Error('expected rewrite');
    expect(result.body).toBe('<p>new</p>');
    expect(result.contentType).toBe('text/html');
  });

  it('should return passthrough if no rule matches the request (TC-003)', () => {
    const rule = buildRule(
      [{ type: 'mock', status: 200, headers: [], body: 'x' }],
      { url: { pattern: 'https://other.x/*', kind: 'glob' } },
    );
    expect(decideInterception([rule], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });

  it('should return passthrough if the matched rule is disabled (TC-003)', () => {
    const rule = buildRule([{ type: 'mock', status: 200, headers: [], body: 'x' }], undefined, {
      enabled: false,
    });
    expect(decideInterception([rule], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });

  it('should return passthrough if global interception is disabled (TC-003)', () => {
    const rule = buildRule([{ type: 'mock', status: 200, headers: [], body: 'x' }]);
    expect(decideInterception([rule], descriptor(), false)).toEqual({ kind: 'passthrough' });
  });

  it('should let the first enabled matching rule win over a later matching rule (TC-004)', () => {
    const first = buildRule([{ type: 'mock', status: 201, headers: [], body: 'first' }], undefined, {
      id: 'first',
    });
    const second = buildRule([{ type: 'mock', status: 202, headers: [], body: 'second' }], undefined, {
      id: 'second',
    });
    const result = decideInterception([first, second], descriptor(), true);
    expect(isMock(result)).toBe(true);
    if (!isMock(result)) throw new Error('expected mock');
    expect(result.body).toBe('first');
    expect(result.status).toBe(201);
  });

  it('should skip a disabled earlier rule and use the next enabled matching rule', () => {
    const disabledFirst = buildRule([{ type: 'mock', status: 201, headers: [], body: 'first' }], undefined, {
      id: 'first',
      enabled: false,
    });
    const enabledSecond = buildRule([{ type: 'mock', status: 202, headers: [], body: 'second' }], undefined, {
      id: 'second',
    });
    const result = decideInterception([disabledFirst, enabledSecond], descriptor(), true);
    expect(isMock(result)).toBe(true);
    if (!isMock(result)) throw new Error('expected mock');
    expect(result.body).toBe('second');
  });

  it('should treat a rule with an invalid regex url pattern as passthrough without throwing', () => {
    const rule = buildRule([{ type: 'mock', status: 200, headers: [], body: 'x' }], {
      url: { pattern: '[', kind: 'regex' },
    });
    expect(() => decideInterception([rule], descriptor(), true)).not.toThrow();
    expect(decideInterception([rule], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });

  it('should serve a mock with an empty body string', () => {
    const rule = buildRule([{ type: 'mock', status: 204, headers: [], body: '' }]);
    const result = decideInterception([rule], descriptor(), true);
    expect(isMock(result)).toBe(true);
    if (!isMock(result)) throw new Error('expected mock');
    expect(result.body).toBe('');
    expect(result.status).toBe(204);
  });

  it('should return passthrough if the matched rule only has actions this engine does not handle', () => {
    const rule = buildRule([
      { type: 'block' },
      { type: 'redirect', url: 'https://elsewhere.x/' },
      { type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X', value: 'y' }] },
    ]);
    expect(decideInterception([rule], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });
});
