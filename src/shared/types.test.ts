import { describe, it, expect } from 'vitest';
import { isTarget } from './types';

describe('isTarget', () => {
  it('should return true if the value is a known target', () => {
    expect(isTarget('chrome')).toBe(true);
    expect(isTarget('firefox')).toBe(true);
  });

  it('should return false if the value is not a known target', () => {
    expect(isTarget('safari')).toBe(false);
    expect(isTarget('')).toBe(false);
  });
});
