import { describe, it, expect } from 'vitest';
import { REPORT_CHANNEL, RULES_CHANNEL, isReportChannelMessage, isRulesSyncMessage } from './channel';
import type { InterceptReport } from '../engine/page/types';

describe('isRulesSyncMessage', () => {
  it('should accept a well-formed rules sync message', () => {
    expect(isRulesSyncMessage({ source: RULES_CHANNEL, rules: [], globalEnabled: true })).toBe(true);
  });

  it('should reject a message with the wrong source', () => {
    expect(isRulesSyncMessage({ source: 'other', rules: [], globalEnabled: true })).toBe(false);
  });

  it('should reject a message whose rules field is not an array', () => {
    expect(isRulesSyncMessage({ source: RULES_CHANNEL, rules: 'nope', globalEnabled: true })).toBe(false);
  });

  it('should reject non-object payloads', () => {
    expect(isRulesSyncMessage(null)).toBe(false);
    expect(isRulesSyncMessage('string')).toBe(false);
    expect(isRulesSyncMessage(undefined)).toBe(false);
  });
});

describe('isReportChannelMessage', () => {
  const report: InterceptReport = { kind: 'mock', method: 'GET', url: 'https://api.x/u', status: 200, body: '{}' };

  it('should accept a well-formed report message', () => {
    expect(isReportChannelMessage({ source: REPORT_CHANNEL, report })).toBe(true);
  });

  it('should reject a wrong source or a missing report object', () => {
    expect(isReportChannelMessage({ source: 'other', report })).toBe(false);
    expect(isReportChannelMessage({ source: REPORT_CHANNEL, report: null })).toBe(false);
    expect(isReportChannelMessage(null)).toBe(false);
  });
});
