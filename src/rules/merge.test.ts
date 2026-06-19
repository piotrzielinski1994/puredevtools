import { describe, it, expect } from 'vitest';
import type { Rule } from './model';
import { mergeRules } from './merge';

const rule = (id: string, name = id): Rule => ({
  id,
  name,
  enabled: true,
  priority: 0,
  matchers: { url: { pattern: `https://${id}.x/*`, kind: 'glob' } },
  actions: [{ type: 'block' }],
});

describe('mergeRules', () => {
  it('should append imported rules after the current ones', () => {
    const result = mergeRules([rule('a')], [rule('b')]);
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('should rename a colliding imported id instead of overwriting the current rule', () => {
    const result = mergeRules([rule('a', 'current a')], [rule('a', 'imported a')]);
    expect(result.map((r) => r.id)).toEqual(['a', 'a-imported']);
    expect(result.find((r) => r.id === 'a')?.name).toBe('current a');
    expect(result.find((r) => r.id === 'a-imported')?.name).toBe('imported a');
  });

  it('should keep escalating the suffix when the renamed id also collides', () => {
    const result = mergeRules([rule('a'), rule('a-imported')], [rule('a')]);
    expect(result.map((r) => r.id)).toEqual(['a', 'a-imported', 'a-imported-2']);
  });

  it('should reassign sequential priorities across the merged list', () => {
    const result = mergeRules([rule('a'), rule('b')], [rule('c')]);
    expect(result.map((r) => r.priority)).toEqual([0, 1, 2]);
  });

  it('should not mutate the input arrays', () => {
    const current = [rule('a')];
    const imported = [rule('b')];
    mergeRules(current, imported);
    expect(current).toHaveLength(1);
    expect(imported[0].id).toBe('b');
  });

  it('should return only the current rules when nothing is imported', () => {
    expect(mergeRules([rule('a')], []).map((r) => r.id)).toEqual(['a']);
  });
});
