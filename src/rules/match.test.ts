import { describe, it, expect } from 'vitest';
import type { Rule, RequestDescriptor, Matchers, RuleAction } from './model';
import { globToRegExp, matchUrl, matchesRequest } from './match';

const buildRule = (
  matchers: Matchers,
  actions: RuleAction[] = [{ type: 'rewriteBody', body: 'x' }],
): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  priority: 0,
  matchers,
  actions,
});

const buildRequest = (overrides: Partial<RequestDescriptor> = {}): RequestDescriptor => ({
  url: 'https://api.example.com/v1/users',
  method: 'GET',
  ...overrides,
});

const expectMatched = (result: ReturnType<typeof matchUrl>, expected: boolean) => {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.matched).toBe(expected);
  }
};

describe('globToRegExp', () => {
  it('should return a RegExp instance for a glob pattern', () => {
    expect(globToRegExp('https://api.example.com/*')).toBeInstanceOf(RegExp);
  });

  it('should translate * into a cross-separator wildcard', () => {
    const regex = globToRegExp('https://api.example.com/*');
    expect(regex.test('https://api.example.com/v1/users')).toBe(true);
  });

  it('should translate ? into a single-character wildcard', () => {
    const regex = globToRegExp('https://a.com/?');
    expect(regex.test('https://a.com/x')).toBe(true);
    expect(regex.test('https://a.com/xy')).toBe(false);
  });

  it('should treat regex-special chars in the literal portion as literals', () => {
    const regex = globToRegExp('https://a.com/x');
    expect(regex.test('https://a.com/x')).toBe(true);
    expect(regex.test('https://aXcom/x')).toBe(false);
  });

  it('should anchor the pattern so partial strings do not match', () => {
    const regex = globToRegExp('https://a.com/x');
    expect(regex.test('https://a.com/x/extra')).toBe(false);
    expect(regex.test('prefix-https://a.com/x')).toBe(false);
  });
});

describe('matchUrl', () => {
  it('should match a glob pattern with a trailing wildcard if the url shares the prefix (TC-001)', () => {
    const result = matchUrl('https://api.example.com/*', 'glob', 'https://api.example.com/v1/users');
    expectMatched(result, true);
  });

  it('should not match a *.png glob if the url ends in a different extension (TC-002)', () => {
    const result = matchUrl('*.png', 'glob', '/foo.jpg');
    expectMatched(result, false);
  });

  it('should treat a literal dot in a glob as a literal char and not a wildcard (TC-003)', () => {
    const result = matchUrl('https://a.com/x', 'glob', 'https://aXcom/x');
    expectMatched(result, false);
  });

  it('should compile and match a valid regex pattern (TC-004)', () => {
    const result = matchUrl('^https://api\\..*/users$', 'regex', 'https://api.example.com/users');
    expectMatched(result, true);
  });

  it('should return an error result without throwing if the regex is invalid (TC-005)', () => {
    const result = matchUrl('([', 'regex', 'https://api.example.com/users');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('should not throw when given an invalid regex pattern', () => {
    expect(() => matchUrl('([', 'regex', 'https://api.example.com/users')).not.toThrow();
  });

  it('should treat an empty glob pattern as match-any', () => {
    const result = matchUrl('', 'glob', 'https://anything.example.com/path');
    expectMatched(result, true);
  });

  it('should treat an empty regex pattern as match-any', () => {
    const result = matchUrl('', 'regex', 'https://anything.example.com/path');
    expectMatched(result, true);
  });

  it('should report a non-matching regex as ok with matched false', () => {
    const result = matchUrl('^https://other\\.com/', 'regex', 'https://api.example.com/users');
    expectMatched(result, false);
  });
});

describe('matchesRequest', () => {
  it('should match if url and method both pass (TC-006)', () => {
    const rule = buildRule({
      url: { pattern: 'https://api.example.com/*', kind: 'glob' },
      methods: ['GET'],
    });
    expectMatched(matchesRequest(rule, buildRequest()), true);
  });

  it('should not match if the method does not match while url does (TC-006)', () => {
    const rule = buildRule({
      url: { pattern: 'https://api.example.com/*', kind: 'glob' },
      methods: ['POST'],
    });
    expectMatched(matchesRequest(rule, buildRequest({ method: 'GET' })), false);
  });

  it('should match any method if no methods are specified (TC-007)', () => {
    const rule = buildRule({
      url: { pattern: 'https://api.example.com/*', kind: 'glob' },
    });
    expectMatched(matchesRequest(rule, buildRequest({ method: 'DELETE' })), true);
  });

  it('should treat an empty methods array as match-any', () => {
    const rule = buildRule({
      url: { pattern: 'https://api.example.com/*', kind: 'glob' },
      methods: [],
    });
    expectMatched(matchesRequest(rule, buildRequest({ method: 'PATCH' })), true);
  });

  it('should match the method case-insensitively (TC-008)', () => {
    const rule = buildRule({
      url: { pattern: 'https://api.example.com/*', kind: 'glob' },
      methods: ['get'] as unknown as Rule['matchers']['methods'],
    });
    expectMatched(matchesRequest(rule, buildRequest({ method: 'GET' })), true);
  });

  it('should match any request if only url is specified and it matches', () => {
    const rule = buildRule({ url: { pattern: '', kind: 'glob' } });
    expectMatched(matchesRequest(rule, buildRequest({ method: 'OPTIONS' })), true);
  });

  it('should surface an error result if the url regex pattern fails to compile', () => {
    const rule = buildRule({ url: { pattern: '([', kind: 'regex' } });
    const result = matchesRequest(rule, buildRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('should not match if the url fails even though the method matches', () => {
    const rule = buildRule({
      url: { pattern: 'https://other.example.com/*', kind: 'glob' },
      methods: ['GET'],
    });
    expectMatched(matchesRequest(rule, buildRequest()), false);
  });
});
