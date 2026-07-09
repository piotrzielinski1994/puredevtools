import { describe, it, expect } from 'vitest';
import type { Rule } from './model';
import type { PortableState } from './schema';
import { EXPORT_VERSION } from '../shared/constants';
import { exportRules, importRules } from './portable';

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  priority: 0,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'block' }],
  ...overrides,
});

const buildState = (overrides: Partial<PortableState> = {}): PortableState => ({
  version: EXPORT_VERSION,
  globalEnabled: true,
  rules: [buildRule({ id: 'a', priority: 0 }), buildRule({ id: 'b', priority: 1 })],
  ...overrides,
});

describe('exportRules', () => {
  it('should return a JSON string parseable into the original state (AC-004)', () => {
    const state = buildState();
    const json = exportRules(state);
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toEqual(state);
  });

  it('should embed the EXPORT_VERSION in the serialized output (AC-004)', () => {
    const json = exportRules(buildState({ version: EXPORT_VERSION }));
    expect(JSON.parse(json).version).toBe(EXPORT_VERSION);
  });

  it('should serialize the globalEnabled flag (AC-004)', () => {
    const json = exportRules(buildState({ globalEnabled: false }));
    expect(JSON.parse(json).globalEnabled).toBe(false);
  });
});

describe('importRules', () => {
  it('should return ok with the parsed state for valid JSON (AC-005)', () => {
    const state = buildState();
    const result = importRules(JSON.stringify(state));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(state);
    }
  });

  it('should return an error result without throwing for an invalid JSON string (TC-007, AC-007)', () => {
    expect(() => importRules('{not json')).not.toThrow();
    const result = importRules('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('should return a validation error for a wrong-shape rule (TC-008, AC-007)', () => {
    const result = importRules('{"version":1,"globalEnabled":true,"rules":[{"bad":1}]}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('should return a validation error when required top-level fields are missing (AC-007)', () => {
    const result = importRules('{"rules":[]}');
    expect(result.ok).toBe(false);
  });

  it('should return a validation error for valid JSON that is not an object (AC-007)', () => {
    const result = importRules('42');
    expect(result.ok).toBe(false);
  });

  it('should reject duplicate rule ids on import (edge case)', () => {
    const state = buildState({
      rules: [buildRule({ id: 'dup', priority: 0 }), buildRule({ id: 'dup', priority: 1 })],
    });
    const result = importRules(JSON.stringify(state));
    expect(result.ok).toBe(false);
  });
});

describe('export -> import round-trip', () => {
  it('should yield a state deep-equal to the original (TC-006, AC-006)', () => {
    const original = buildState({
      globalEnabled: false,
      rules: [
        buildRule({
          id: 'r1',
          priority: 0,
          matchers: {
            url: { pattern: '^https://api\\.test/', kind: 'regex' },
            methods: ['GET', 'POST'],
            requestHeaders: [{ name: 'authorization', contains: 'Bearer' }],
          },
          actions: [{ type: 'redirect', url: 'https://mock.test' }],
        }),
        buildRule({
          id: 'r2',
          priority: 1,
          actions: [{ type: 'mock', status: 200, headers: [], body: '{}', contentType: 'application/json' }],
        }),
      ],
    });
    const result = importRules(exportRules(original));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(original);
    }
  });
});
