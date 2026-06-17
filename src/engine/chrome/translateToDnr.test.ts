import { describe, it, expect } from 'vitest';
import type { Matchers, Rule, RuleAction } from '../../rules/model';
import { translateRules } from './translateToDnr';

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

describe('translateRules - global gating (TC-009, AC-008)', () => {
  it('should produce no dnr rules if globalEnabled is false', () => {
    const result = translateRules([buildRule([{ type: 'block' }])], false);
    expect(result.dnrRules).toEqual([]);
  });

  it('should exclude a disabled rule from the output', () => {
    const result = translateRules(
      [buildRule([{ type: 'block' }], undefined, { enabled: false })],
      true,
    );
    expect(result.dnrRules).toEqual([]);
  });

  it('should translate only the enabled rules when mixed with disabled ones', () => {
    const result = translateRules(
      [
        buildRule([{ type: 'block' }], undefined, { id: 'on', enabled: true }),
        buildRule([{ type: 'block' }], undefined, { id: 'off', enabled: false }),
      ],
      true,
    );
    expect(result.dnrRules).toHaveLength(1);
  });

  it('should return an empty dnr rule set for an empty rule list', () => {
    const result = translateRules([], true);
    expect(result.dnrRules).toEqual([]);
  });
});

describe('translateRules - request header action (TC-002, TC-003, AC-003)', () => {
  it('should map a request header set op to a modifyHeaders dnr rule with a set requestHeaders op', () => {
    const result = translateRules(
      [buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] }])],
      true,
    );
    expect(result.dnrRules).toHaveLength(1);
    expect(result.dnrRules[0].action.type).toBe('modifyHeaders');
    expect(result.dnrRules[0].action.requestHeaders).toEqual([
      { header: 'X-Env', operation: 'set', value: 'staging' },
    ]);
  });

  it('should map a request header remove op to a remove requestHeaders op', () => {
    const result = translateRules(
      [buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'remove', name: 'Cookie' }] }])],
      true,
    );
    expect(result.dnrRules[0].action.requestHeaders).toEqual([
      { header: 'Cookie', operation: 'remove' },
    ]);
  });

  it('should not populate responseHeaders for a request header action', () => {
    const result = translateRules(
      [buildRule([{ type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] }])],
      true,
    );
    expect(result.dnrRules[0].action.responseHeaders).toBeUndefined();
  });
});

describe('translateRules - response header action (AC-003)', () => {
  it('should map a response header set op to modifyHeaders with a responseHeaders set op', () => {
    const result = translateRules(
      [buildRule([{ type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Cache', value: 'MISS' }] }])],
      true,
    );
    expect(result.dnrRules[0].action.type).toBe('modifyHeaders');
    expect(result.dnrRules[0].action.responseHeaders).toEqual([
      { header: 'X-Cache', operation: 'set', value: 'MISS' },
    ]);
  });

  it('should map a response header remove op to a responseHeaders remove op', () => {
    const result = translateRules(
      [buildRule([{ type: 'modifyResponseHeaders', headers: [{ op: 'remove', name: 'Set-Cookie' }] }])],
      true,
    );
    expect(result.dnrRules[0].action.responseHeaders).toEqual([
      { header: 'Set-Cookie', operation: 'remove' },
    ]);
  });
});

describe('translateRules - block action (TC-004, AC-004)', () => {
  it('should map a block action to a block dnr action', () => {
    const result = translateRules([buildRule([{ type: 'block' }])], true);
    expect(result.dnrRules[0].action.type).toBe('block');
  });
});

describe('translateRules - redirect action (TC-005, AC-005)', () => {
  it('should map a redirect action to a redirect dnr action with the target url', () => {
    const result = translateRules(
      [buildRule([{ type: 'redirect', url: 'https://other.example.com/x' }])],
      true,
    );
    expect(result.dnrRules[0].action.type).toBe('redirect');
    expect(result.dnrRules[0].action.redirect?.url).toBe('https://other.example.com/x');
  });
});

describe('translateRules - mock action (TC-006, AC-006)', () => {
  it('should map a mock action to a redirect to a data: url and not a passthrough to the origin', () => {
    const result = translateRules(
      [buildRule([{ type: 'mock', status: 200, headers: [], body: '{"ok":true}', contentType: 'application/json' }])],
      true,
    );
    expect(result.dnrRules[0].action.type).toBe('redirect');
    expect(result.dnrRules[0].action.redirect?.url.startsWith('data:')).toBe(true);
  });

  it('should encode the mock body inside the data: url', () => {
    const result = translateRules(
      [buildRule([{ type: 'mock', status: 200, headers: [], body: '{"ok":true}' }])],
      true,
    );
    const url = result.dnrRules[0].action.redirect?.url ?? '';
    const decoded = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    expect(decoded).toContain('ok');
  });

  it('should flag a non-200 mock status as unsupported because a data url cannot set the status', () => {
    const result = translateRules(
      [buildRule([{ type: 'mock', status: 503, headers: [], body: 'x' }])],
      true,
    );
    expect(result.dnrRules[0].action.type).toBe('redirect');
    expect(result.unsupported).toContain('mockStatus');
  });

  it('should flag mock response headers as unsupported because a data url cannot set them', () => {
    const result = translateRules(
      [buildRule([{ type: 'mock', status: 200, headers: [{ op: 'set', name: 'X-Mock', value: '1' }], body: 'x' }])],
      true,
    );
    expect(result.unsupported).toContain('mockHeaders');
  });

  it('should not flag a plain 200 mock with no headers as unsupported', () => {
    const result = translateRules(
      [buildRule([{ type: 'mock', status: 200, headers: [], body: 'x' }])],
      true,
    );
    expect(result.unsupported).toEqual([]);
  });

  it('should still emit the data: url redirect when the mock has latencyMs but flag latency as unsupported', () => {
    const result = translateRules(
      [buildRule([{ type: 'mock', status: 200, headers: [], body: 'x', latencyMs: 500 }])],
      true,
    );
    expect(result.dnrRules[0].action.type).toBe('redirect');
    expect(result.dnrRules[0].action.redirect?.url.startsWith('data:')).toBe(true);
    expect(result.unsupported.length).toBeGreaterThan(0);
  });
});

describe('translateRules - unsupported response-body & status actions (TC-010, AC-009)', () => {
  it('should not emit a dnr rule for a rewriteBody action', () => {
    const result = translateRules(
      [buildRule([{ type: 'rewriteBody', body: '<html></html>', contentType: 'text/html' }])],
      true,
    );
    expect(result.dnrRules).toEqual([]);
  });

  it('should flag rewriteBody in the unsupported list', () => {
    const result = translateRules(
      [buildRule([{ type: 'rewriteBody', body: '<html></html>' }])],
      true,
    );
    expect(result.unsupported).toContain('rewriteBody');
  });

  it('should not emit a dnr rule for a setStatus action', () => {
    const result = translateRules([buildRule([{ type: 'setStatus', status: 503 }])], true);
    expect(result.dnrRules).toEqual([]);
  });

  it('should flag setStatus in the unsupported list', () => {
    const result = translateRules([buildRule([{ type: 'setStatus', status: 503 }])], true);
    expect(result.unsupported).toContain('setStatus');
  });

  it('should emit supported actions while flagging the unsupported ones on the same rule', () => {
    const result = translateRules(
      [
        buildRule([
          { type: 'block' },
          { type: 'rewriteBody', body: 'x' },
        ]),
      ],
      true,
    );
    expect(result.dnrRules.map((rule) => rule.action.type)).toEqual(['block']);
    expect(result.unsupported).toContain('rewriteBody');
  });
});

describe('translateRules - one dnr rule per action with sequential ids', () => {
  it('should emit one dnr rule per translatable action on a rule', () => {
    const result = translateRules(
      [
        buildRule([
          { type: 'block' },
          { type: 'redirect', url: 'https://x.example.com/' },
        ]),
      ],
      true,
    );
    expect(result.dnrRules).toHaveLength(2);
  });

  it('should assign sequential ids starting at 1 across the whole output', () => {
    const result = translateRules(
      [
        buildRule([{ type: 'block' }], undefined, { id: 'a' }),
        buildRule([{ type: 'redirect', url: 'https://x.example.com/' }], undefined, { id: 'b' }),
      ],
      true,
    );
    expect(result.dnrRules.map((rule) => rule.id)).toEqual([1, 2]);
  });
});

describe('translateRules - glob/regex condition mapping (TC-007, AC-007)', () => {
  it('should set condition.urlFilter for a glob pattern and leave regexFilter unset', () => {
    const result = translateRules(
      [buildRule([{ type: 'block' }], { url: { pattern: 'https://api.example.com/*', kind: 'glob' } })],
      true,
    );
    expect(result.dnrRules[0].condition.urlFilter).toBe('https://api.example.com/*');
    expect(result.dnrRules[0].condition.regexFilter).toBeUndefined();
  });

  it('should set condition.regexFilter for a regex pattern and leave urlFilter unset', () => {
    const result = translateRules(
      [buildRule([{ type: 'block' }], { url: { pattern: '^https://api\\..*$', kind: 'regex' } })],
      true,
    );
    expect(result.dnrRules[0].condition.regexFilter).toBe('^https://api\\..*$');
    expect(result.dnrRules[0].condition.urlFilter).toBeUndefined();
  });
});

describe('translateRules - invalid regex handling (edge case, ADT)', () => {
  it('should not emit a dnr rule for a rule with an invalid regex pattern', () => {
    const result = translateRules(
      [buildRule([{ type: 'block' }], { url: { pattern: '([', kind: 'regex' } })],
      true,
    );
    expect(result.dnrRules).toEqual([]);
  });

  it('should push a string into the errors list for an invalid regex pattern without throwing', () => {
    const call = () =>
      translateRules(
        [buildRule([{ type: 'block' }], { url: { pattern: '([', kind: 'regex' } })],
        true,
      );
    expect(call).not.toThrow();
    const result = call();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(typeof result.errors[0]).toBe('string');
  });
});

describe('translateRules - method/resourceType condition mapping (TC-008, AC-007)', () => {
  it('should set requestMethods lowercased from the rule methods', () => {
    const result = translateRules(
      [
        buildRule([{ type: 'block' }], {
          url: { pattern: 'https://api.example.com/*', kind: 'glob' },
          methods: ['GET', 'POST'],
        }),
      ],
      true,
    );
    expect(result.dnrRules[0].condition.requestMethods).toEqual(['get', 'post']);
  });

  it('should set resourceTypes from the rule resource types', () => {
    const result = translateRules(
      [
        buildRule([{ type: 'block' }], {
          url: { pattern: 'https://api.example.com/*', kind: 'glob' },
          resourceTypes: ['xmlhttprequest', 'script'],
        }),
      ],
      true,
    );
    expect(result.dnrRules[0].condition.resourceTypes).toEqual(['xmlhttprequest', 'script']);
  });

  it('should leave requestMethods and resourceTypes unset when not specified', () => {
    const result = translateRules(
      [buildRule([{ type: 'block' }], { url: { pattern: 'https://api.example.com/*', kind: 'glob' } })],
      true,
    );
    expect(result.dnrRules[0].condition.requestMethods).toBeUndefined();
    expect(result.dnrRules[0].condition.resourceTypes).toBeUndefined();
  });
});
