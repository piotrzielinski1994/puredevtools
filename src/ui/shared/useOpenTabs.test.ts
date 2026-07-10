// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOpenTabs } from './useOpenTabs';

const DRAFT = 'new:draft';

describe('useOpenTabs', () => {
  it('should start with no open tabs and no active tab if nothing was opened', () => {
    // behavior: initial state is { openKeys: [], activeKey: null }
    const { result } = renderHook(() => useOpenTabs([]));

    expect(result.current.openKeys).toEqual([]);
    expect(result.current.activeKey).toBeNull();
  });

  it('should add a key and make it active if open is called', () => {
    // behavior: open() adds key + activates it
    const { result } = renderHook(() => useOpenTabs(['a']));

    act(() => result.current.open('a'));

    expect(result.current.openKeys).toEqual(['a']);
    expect(result.current.activeKey).toBe('a');
  });

  it('should append and activate the newly opened key if a different key is already open', () => {
    // behavior: opening a second distinct key keeps both and activates the new one
    const { result } = renderHook(() => useOpenTabs(['a', 'b']));

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));

    expect(result.current.openKeys).toEqual(['a', 'b']);
    expect(result.current.activeKey).toBe('b');
  });

  it('should not duplicate a key but re-activate it if open is called on an already-open key', () => {
    // behavior: open() on an already-open key only activates it (no duplicate entry)
    const { result } = renderHook(() => useOpenTabs(['a', 'b']));

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));
    act(() => result.current.open('a'));

    expect(result.current.openKeys).toEqual(['a', 'b']);
    expect(result.current.activeKey).toBe('a');
  });

  it('should change the active key without touching openKeys if setActive is called', () => {
    // behavior: setActive(key) only moves the active pointer
    const { result } = renderHook(() => useOpenTabs(['a', 'b']));

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));
    act(() => result.current.setActive('a'));

    expect(result.current.openKeys).toEqual(['a', 'b']);
    expect(result.current.activeKey).toBe('a');
  });

  it('should activate the previous tab if the active tab is closed and a previous one exists', () => {
    // behavior: close(active) activates an adjacent key, preferring the previous index
    const { result } = renderHook(() => useOpenTabs(['a', 'b', 'c']));

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));
    act(() => result.current.open('c'));
    act(() => result.current.close('c'));

    expect(result.current.openKeys).toEqual(['a', 'b']);
    expect(result.current.activeKey).toBe('b');
  });

  it('should activate the next tab if the closed active tab was first with no previous', () => {
    // behavior: close(active) falls back to the next key when there is no previous
    const { result } = renderHook(() => useOpenTabs(['a', 'b', 'c']));

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));
    act(() => result.current.open('c'));
    act(() => result.current.setActive('a'));
    act(() => result.current.close('a'));

    expect(result.current.openKeys).toEqual(['b', 'c']);
    expect(result.current.activeKey).toBe('b');
  });

  it('should clear the active key if the only open tab is closed', () => {
    // behavior: close(active) with nothing left sets activeKey to null
    const { result } = renderHook(() => useOpenTabs(['a']));

    act(() => result.current.open('a'));
    act(() => result.current.close('a'));

    expect(result.current.openKeys).toEqual([]);
    expect(result.current.activeKey).toBeNull();
  });

  it('should leave the active key unchanged if a non-active tab is closed', () => {
    // behavior: close(non-active) does not move the active pointer
    const { result } = renderHook(() => useOpenTabs(['a', 'b', 'c']));

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));
    act(() => result.current.open('c'));
    act(() => result.current.close('a'));

    expect(result.current.openKeys).toEqual(['b', 'c']);
    expect(result.current.activeKey).toBe('c');
  });

  it('should be a no-op if close is called with a key that is not open', () => {
    // behavior: closing an unknown key leaves state untouched
    const { result } = renderHook(() => useOpenTabs(['a']));

    act(() => result.current.open('a'));
    act(() => result.current.close('zzz'));

    expect(result.current.openKeys).toEqual(['a']);
    expect(result.current.activeKey).toBe('a');
  });

  it('should prune an open non-active key if ruleIds no longer includes it', () => {
    // behavior: ruleIds change prunes open keys not present, active pointer unaffected
    const { result, rerender } = renderHook((ids: string[]) => useOpenTabs(ids), {
      initialProps: ['a', 'b', 'c'],
    });

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));

    rerender(['b', 'c']);

    expect(result.current.openKeys).toEqual(['b']);
    expect(result.current.activeKey).toBe('b');
  });

  it('should move active to the previous remaining key if the active key is pruned by ruleIds', () => {
    // behavior: pruning the active key moves active to an adjacent key, preferring previous
    const { result, rerender } = renderHook((ids: string[]) => useOpenTabs(ids), {
      initialProps: ['a', 'b', 'c'],
    });

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));

    rerender(['a', 'c']);

    expect(result.current.openKeys).toEqual(['a']);
    expect(result.current.activeKey).toBe('a');
  });

  it('should move active to the next remaining key if the pruned active key had no previous', () => {
    // behavior: pruning the first active key falls back to the next remaining key
    const { result, rerender } = renderHook((ids: string[]) => useOpenTabs(ids), {
      initialProps: ['a', 'b', 'c'],
    });

    act(() => result.current.open('a'));
    act(() => result.current.open('b'));
    act(() => result.current.setActive('a'));

    rerender(['b', 'c']);

    expect(result.current.openKeys).toEqual(['b']);
    expect(result.current.activeKey).toBe('b');
  });

  it('should clear active if the last open key is pruned by ruleIds', () => {
    // behavior: pruning the only key leaves openKeys empty and active null
    const { result, rerender } = renderHook((ids: string[]) => useOpenTabs(ids), {
      initialProps: ['a'],
    });

    act(() => result.current.open('a'));

    rerender([]);

    expect(result.current.openKeys).toEqual([]);
    expect(result.current.activeKey).toBeNull();
  });

  it('should never prune the draft sentinel tab when ruleIds change', () => {
    // behavior: the "new:draft" sentinel survives any ruleIds change
    const { result, rerender } = renderHook((ids: string[]) => useOpenTabs(ids), {
      initialProps: ['a'],
    });

    act(() => result.current.open(DRAFT));

    rerender([]);

    expect(result.current.openKeys).toEqual([DRAFT]);
    expect(result.current.activeKey).toBe(DRAFT);
  });
});
