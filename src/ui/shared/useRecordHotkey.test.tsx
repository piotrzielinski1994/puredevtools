import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRecordHotkey } from './useRecordHotkey';

// jsdom reports a non-mac platform, so the recorder canonicalizes Control-based
// combos to "Mod+..". These tests dispatch real KeyboardEvents on document.

describe('useRecordHotkey', () => {
  // TC-031 behavior: not recording before startRecording.
  it('should not be recording before startRecording is called', () => {
    const onRecord = vi.fn();
    const { result } = renderHook(() => useRecordHotkey({ onRecord }));
    expect(result.current.isRecording).toBe(false);
  });

  // TC-031 behavior: recording after startRecording.
  it('should be recording after startRecording is called', () => {
    const onRecord = vi.fn();
    const { result } = renderHook(() => useRecordHotkey({ onRecord }));
    act(() => {
      result.current.startRecording();
    });
    expect(result.current.isRecording).toBe(true);
  });

  // TC-031, AC-012 side-effect-contract: a composed combo records the canonical hotkey once.
  it('should call onRecord once with the canonical hotkey if a combo is pressed while recording', () => {
    const onRecord = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useRecordHotkey({ onRecord, onCancel }));

    act(() => {
      result.current.startRecording();
    });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          ctrlKey: true,
          altKey: true,
          key: 'π',
          code: 'KeyP',
          bubbles: true,
        }),
      );
    });

    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onRecord).toHaveBeenCalledWith('Mod+Alt+P');
    expect(onCancel).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  // TC-031 side-effect-contract: Escape aborts (onCancel), records nothing.
  it('should call onCancel and record nothing if Escape is pressed while recording', () => {
    const onRecord = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useRecordHotkey({ onRecord, onCancel }));

    act(() => {
      result.current.startRecording();
    });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
      );
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRecord).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  // TC-031 behavior: a modifier-only keydown is ignored and recording continues.
  it('should ignore a modifier-only keydown and keep recording', () => {
    const onRecord = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useRecordHotkey({ onRecord, onCancel }));

    act(() => {
      result.current.startRecording();
    });
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          ctrlKey: true,
          key: 'Control',
          code: 'ControlLeft',
          bubbles: true,
        }),
      );
    });

    expect(onRecord).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(true);
  });

  // TC-031 behavior: cancelRecording stops recording without firing callbacks.
  it('should stop recording without firing callbacks if cancelRecording is called', () => {
    const onRecord = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useRecordHotkey({ onRecord, onCancel }));

    act(() => {
      result.current.startRecording();
    });
    act(() => {
      result.current.cancelRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(onRecord).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
