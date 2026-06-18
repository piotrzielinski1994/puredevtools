import { describe, it, expect } from 'vitest';
import { RULES_CHANNEL, isRulesSyncMessage } from './channel';

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
