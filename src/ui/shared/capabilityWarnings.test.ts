import { describe, it, expect } from 'vitest';
import { capabilityWarnings, type CapabilityInput } from './RuleForm';

const base: CapabilityInput = {
  responseBodyRewrite: true,
  artificialLatency: true,
  rewriteBody: '',
  mockEnabled: false,
  mockStatus: '200',
  mockLatency: '0',
  mockHeaderCount: 0,
};

describe('capabilityWarnings', () => {
  it('should return no warnings when the platform supports everything in use', () => {
    expect(capabilityWarnings({ ...base, rewriteBody: '<p>x</p>', mockEnabled: true, mockStatus: '503', mockHeaderCount: 2, mockLatency: '300' })).toEqual([]);
  });

  it('should warn that response-body rewrite is ignored on Chrome', () => {
    const warnings = capabilityWarnings({ ...base, responseBodyRewrite: false, rewriteBody: '<p>x</p>' });
    expect(warnings).toEqual(['Response-body rewrite is Firefox-only; it will be ignored on Chrome.']);
  });

  it('should not warn about rewrite when the body is empty', () => {
    expect(capabilityWarnings({ ...base, responseBodyRewrite: false, rewriteBody: '   ' })).toEqual([]);
  });

  it('should warn about custom mock status, headers and latency on Chrome', () => {
    const warnings = capabilityWarnings({
      ...base,
      artificialLatency: false,
      mockEnabled: true,
      mockStatus: '503',
      mockHeaderCount: 1,
      mockLatency: '300',
    });
    expect(warnings).toHaveLength(3);
    expect(warnings.some((w) => /status/i.test(w))).toBe(true);
    expect(warnings.some((w) => /headers/i.test(w))).toBe(true);
    expect(warnings.some((w) => /latency/i.test(w))).toBe(true);
  });

  it('should not warn about a 200 mock status on Chrome', () => {
    const warnings = capabilityWarnings({ ...base, artificialLatency: false, mockEnabled: true, mockStatus: '200' });
    expect(warnings).toEqual([]);
  });

  it('should not warn about mock fields when the mock is disabled', () => {
    expect(capabilityWarnings({ ...base, artificialLatency: false, mockEnabled: false, mockStatus: '503', mockHeaderCount: 5 })).toEqual([]);
  });
});
