// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRuleDrafts, type RuleDrafts } from './useRuleDrafts';
import type { RuleDraft } from './ruleDraft';

const draft = (overrides: Partial<RuleDraft> = {}): RuleDraft => ({
  name: 'a',
  pattern: 'https://a.test/*',
  kind: 'glob',
  methods: [],
  responseOps: [],
  rewriteBody: '',
  ...overrides,
});

const renderDrafts = (): { current: () => RuleDrafts } => {
  const { result } = renderHook(() => useRuleDrafts());
  return { current: () => result.current };
};

describe('useRuleDrafts', () => {
  it('should return the stored draft if setEdit was called for that key', () => {
    // behavior: setEdit then getEdit round-trips the exact draft
    const drafts = renderDrafts();
    const edited = draft({ name: 'edited' });

    act(() => drafts.current().setEdit('a', edited));

    expect(drafts.current().getEdit('a')).toEqual(edited);
  });

  it('should return undefined for a key that was never set', () => {
    // behavior: an unedited key has no draft
    const drafts = renderDrafts();

    expect(drafts.current().getEdit('unknown')).toBeUndefined();
  });

  it('should remove a key if discard is called for it', () => {
    // behavior: discard drops the tab's stored edit
    const drafts = renderDrafts();
    act(() => drafts.current().setEdit('a', draft()));

    act(() => drafts.current().discard('a'));

    expect(drafts.current().getEdit('a')).toBeUndefined();
  });

  it('should keep surviving keys and drop the rest if prune is called', () => {
    // behavior: prune retains only the keys still open
    const drafts = renderDrafts();
    act(() => {
      drafts.current().setEdit('a', draft({ name: 'A' }));
      drafts.current().setEdit('b', draft({ name: 'B' }));
      drafts.current().setEdit('c', draft({ name: 'C' }));
    });

    act(() => drafts.current().prune(['a', 'c']));

    expect(drafts.current().getEdit('a')).toEqual(draft({ name: 'A' }));
    expect(drafts.current().getEdit('c')).toEqual(draft({ name: 'C' }));
    expect(drafts.current().getEdit('b')).toBeUndefined();
  });
});
