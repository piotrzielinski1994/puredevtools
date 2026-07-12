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
  matchers,
  actions,
  ...overrides,
});

const descriptor = (overrides: Partial<RequestDescriptor> = {}): RequestDescriptor => ({
  url: 'https://api.x/users',
  method: 'GET',
  ...overrides,
});

const isOverride = (
  interception: Interception,
): interception is Extract<Interception, { kind: 'override' }> => interception.kind === 'override';

describe('decideInterception (AC-001, AC-006)', () => {
  it('should map a rewriteBody rule to an override carrying the body and content type (AC-002)', () => {
    const rule = buildRule([{ type: 'rewriteBody', body: '<p>new</p>', contentType: 'text/html' }]);
    const result = decideInterception([rule], descriptor(), true);
    expect(isOverride(result)).toBe(true);
    if (!isOverride(result)) throw new Error('expected override');
    expect(result.body).toBe('<p>new</p>');
    expect(result.contentType).toBe('text/html');
    expect(result.headerOps).toEqual([]);
  });

  it('should map a modifyResponseHeaders rule to an override carrying the header ops and no body (AC-003)', () => {
    const rule = buildRule([
      { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Test', value: 'on' }] },
    ]);
    const result = decideInterception([rule], descriptor(), true);
    expect(isOverride(result)).toBe(true);
    if (!isOverride(result)) throw new Error('expected override');
    expect(result.headerOps).toEqual([{ op: 'set', name: 'X-Test', value: 'on' }]);
    expect(result.body).toBeUndefined();
  });

  it('should combine header ops and body when a rule carries both actions (AC-004)', () => {
    const rule = buildRule([
      { type: 'modifyResponseHeaders', headers: [{ op: 'remove', name: 'Set-Cookie' }] },
      { type: 'rewriteBody', body: '{"x":1}' },
    ]);
    const result = decideInterception([rule], descriptor(), true);
    expect(isOverride(result)).toBe(true);
    if (!isOverride(result)) throw new Error('expected override');
    expect(result.headerOps).toEqual([{ op: 'remove', name: 'Set-Cookie' }]);
    expect(result.body).toBe('{"x":1}');
  });

  it('should return passthrough if no rule matches the request (AC-006)', () => {
    const rule = buildRule([{ type: 'rewriteBody', body: 'x' }], {
      url: { pattern: 'https://other.x/*', kind: 'glob' },
    });
    expect(decideInterception([rule], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });

  it('should return passthrough if the matched rule is disabled (AC-006)', () => {
    const rule = buildRule([{ type: 'rewriteBody', body: 'x' }], undefined, { enabled: false });
    expect(decideInterception([rule], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });

  it('should return passthrough if global interception is disabled (AC-006)', () => {
    const rule = buildRule([{ type: 'rewriteBody', body: 'x' }]);
    expect(decideInterception([rule], descriptor(), false)).toEqual({ kind: 'passthrough' });
  });

  it('should return passthrough if the matched rule carries no response action', () => {
    const rule = buildRule([]);
    expect(decideInterception([rule], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });

  it('should not match when the method filter excludes the request method (AC-001, TC-005)', () => {
    const rule = buildRule([{ type: 'rewriteBody', body: 'x' }], {
      url: { pattern: 'https://api.x/*', kind: 'glob' },
      methods: ['POST'],
    });
    expect(decideInterception([rule], descriptor({ method: 'GET' }), true)).toEqual({ kind: 'passthrough' });
    expect(isOverride(decideInterception([rule], descriptor({ method: 'POST' }), true))).toBe(true);
  });

  it('should let the first enabled matching rule win over a later matching rule', () => {
    const first = buildRule([{ type: 'rewriteBody', body: 'first' }], undefined, { id: 'first' });
    const second = buildRule([{ type: 'rewriteBody', body: 'second' }], undefined, { id: 'second' });
    const result = decideInterception([first, second], descriptor(), true);
    if (!isOverride(result)) throw new Error('expected override');
    expect(result.body).toBe('first');
  });

  it('should skip a disabled earlier rule and use the next enabled matching rule', () => {
    const disabledFirst = buildRule([{ type: 'rewriteBody', body: 'first' }], undefined, {
      id: 'first',
      enabled: false,
    });
    const enabledSecond = buildRule([{ type: 'rewriteBody', body: 'second' }], undefined, { id: 'second' });
    const result = decideInterception([disabledFirst, enabledSecond], descriptor(), true);
    if (!isOverride(result)) throw new Error('expected override');
    expect(result.body).toBe('second');
  });

  it('should treat a rule with an invalid regex url pattern as passthrough without throwing', () => {
    const rule = buildRule([{ type: 'rewriteBody', body: 'x' }], { url: { pattern: '[', kind: 'regex' } });
    expect(() => decideInterception([rule], descriptor(), true)).not.toThrow();
    expect(decideInterception([rule], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });

  it('should ignore legacy stored action types and fall through to passthrough (AC-006, rollout)', () => {
    const legacy = {
      id: 'legacy',
      name: 'x',
      enabled: true,
      priority: 0,
      matchers: { url: { pattern: 'https://api.x/*', kind: 'glob' } },
      actions: [{ type: 'mock', status: 200, headers: [], body: 'x' }],
    } as unknown as Rule;
    expect(decideInterception([legacy], descriptor(), true)).toEqual({ kind: 'passthrough' });
  });
});
