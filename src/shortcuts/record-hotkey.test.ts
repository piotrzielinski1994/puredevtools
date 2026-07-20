import { describe, it, expect } from 'vitest';
import { matchesKeyboardEvent, type Hotkey } from '@tanstack/hotkeys';
import { eventToHotkey } from './record-hotkey';

// This file runs in the NODE test env (no DOM, no global KeyboardEvent), so
// eventToHotkey is exercised with plain event bags and an explicit "mac"
// platform. The round-trip assertions feed the same bag to matchesKeyboardEvent
// (which also accepts a bag) to prove the recorder mirrors the matcher.

describe('eventToHotkey', () => {
  // TC-031, AC-012 behavior: a macOS Option-composed letter records by physical key.
  it('should record the physical combo if the key composes under mac Option', () => {
    const hotkey = eventToHotkey(
      { metaKey: true, altKey: true, key: 'π', code: 'KeyP' },
      'mac',
    );
    expect(hotkey).toBe('Mod+Alt+P');
  });

  // TC-031, AC-012 behavior: an ASCII letter is trusted from event.key (Dvorak remap).
  it('should trust the layout key from event.key if the key is an ASCII letter', () => {
    const hotkey = eventToHotkey({ metaKey: true, key: 'l', code: 'KeyP' }, 'mac');
    expect(hotkey).toBe('Mod+L');
  });

  // TC-031 behavior: a Meta modifier-only press is not a hotkey.
  it('should return null if the event is a Meta modifier-only press', () => {
    expect(eventToHotkey({ metaKey: true, key: 'Meta', code: 'MetaLeft' }, 'mac')).toBeNull();
  });

  // TC-031 behavior: a Shift modifier-only press is not a hotkey.
  it('should return null if the event is a Shift modifier-only press', () => {
    expect(eventToHotkey({ shiftKey: true, key: 'Shift', code: 'ShiftLeft' }, 'mac')).toBeNull();
  });

  // TC-031 behavior: a Control modifier-only press is not a hotkey.
  it('should return null if the event is a Control modifier-only press', () => {
    expect(eventToHotkey({ ctrlKey: true, key: 'Control', code: 'ControlLeft' }, 'mac')).toBeNull();
  });

  // TC-031 behavior: an Alt modifier-only press is not a hotkey.
  it('should return null if the event is an Alt modifier-only press', () => {
    expect(eventToHotkey({ altKey: true, key: 'Alt', code: 'AltLeft' }, 'mac')).toBeNull();
  });

  // TC-031, AC-012 behavior: Option-composed punctuation records the physical key.
  it('should record the physical punctuation key if Option composes it on mac', () => {
    const hotkey = eventToHotkey(
      { metaKey: true, altKey: true, key: '–', code: 'Minus' },
      'mac',
    );
    expect(hotkey).toBe('Mod+Alt+-');
  });

  // TC-031, AC-012 side-effect-contract: the recorded combo is exactly what the
  // matcher fires on for a composed letter.
  it('should produce a hotkey the matcher fires on for a mac Option-composed letter', () => {
    const bag = { ctrlKey: false, shiftKey: false, metaKey: true, altKey: true, key: 'π', code: 'KeyP' };
    const hotkey = eventToHotkey(bag, 'mac');
    expect(hotkey).toBe('Mod+Alt+P');
    expect(
      matchesKeyboardEvent(bag as unknown as KeyboardEvent, hotkey as Hotkey, 'mac'),
    ).toBe(true);
  });

  // TC-031, AC-012 side-effect-contract: same round-trip for the punctuation path.
  it('should produce a hotkey the matcher fires on for a mac Option-composed punctuation', () => {
    const bag = { ctrlKey: false, shiftKey: false, metaKey: true, altKey: true, key: '–', code: 'Minus' };
    const hotkey = eventToHotkey(bag, 'mac');
    expect(hotkey).toBe('Mod+Alt+-');
    expect(
      matchesKeyboardEvent(bag as unknown as KeyboardEvent, hotkey as Hotkey, 'mac'),
    ).toBe(true);
  });
});
