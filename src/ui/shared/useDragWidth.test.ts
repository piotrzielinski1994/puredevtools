// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { clampWidth, useDragWidth } from './useDragWidth';

describe('clampWidth', () => {
  it('should return the value unchanged if within bounds', () => {
    expect(clampWidth(300, 240, 560)).toBe(300);
  });

  it('should clamp to min if below the minimum', () => {
    expect(clampWidth(100, 240, 560)).toBe(240);
  });

  it('should clamp to max if above the maximum', () => {
    expect(clampWidth(999, 240, 560)).toBe(560);
  });
});

describe('useDragWidth', () => {
  it('should start at the initial width clamped into range', () => {
    const { result } = renderHook(() => useDragWidth(1000, 240, 560));
    expect(result.current.width).toBe(560);
    expect(result.current.isDragging).toBe(false);
  });

  it('should enter dragging state on handle mouse down', () => {
    const { result } = renderHook(() => useDragWidth(320, 240, 560));
    act(() => result.current.onHandleMouseDown({ clientX: 100, preventDefault: () => undefined }));
    expect(result.current.isDragging).toBe(true);
  });

  it('should grow the width as the pointer moves right while dragging', () => {
    const { result } = renderHook(() => useDragWidth(320, 240, 560));
    act(() => result.current.onHandleMouseDown({ clientX: 100, preventDefault: () => undefined }));
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 })));
    expect(result.current.width).toBe(380);
  });

  it('should clamp the dragged width to the maximum', () => {
    const { result } = renderHook(() => useDragWidth(320, 240, 560));
    act(() => result.current.onHandleMouseDown({ clientX: 100, preventDefault: () => undefined }));
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 900 })));
    expect(result.current.width).toBe(560);
  });

  it('should stop dragging on mouse up and ignore later moves', () => {
    const { result } = renderHook(() => useDragWidth(320, 240, 560));
    act(() => result.current.onHandleMouseDown({ clientX: 100, preventDefault: () => undefined }));
    act(() => window.dispatchEvent(new MouseEvent('mouseup')));
    expect(result.current.isDragging).toBe(false);
    act(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 })));
    expect(result.current.width).toBe(320);
  });
});
