import {
  PUNCTUATION_CODE_MAP,
  detectPlatform,
  isModifierKey,
  normalizeHotkeyFromParsed,
  normalizeKeyName,
  rawHotkeyToParsedHotkey,
} from '@tanstack/hotkeys';

type Platform = 'mac' | 'windows' | 'linux';

export type KeyEventLike = {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  key: string;
  code?: string;
};

const isAsciiLetter = (value: string): boolean => /^[A-Za-z]$/.test(value);

const physicalKey = (event: KeyEventLike): string | null => {
  const key = normalizeKeyName(event.key);
  const isModifier: boolean = isModifierKey(key);
  if (isModifier) return null;
  if (isAsciiLetter(key)) return key.toUpperCase();
  const code = event.code ?? '';
  if (code.startsWith('Key')) {
    const letter = code.slice(3);
    if (isAsciiLetter(letter)) return letter.toUpperCase();
  }
  if (code.startsWith('Digit')) {
    const digit = code.slice(5);
    if (/^[0-9]$/.test(digit)) return digit;
  }
  if (code in PUNCTUATION_CODE_MAP) return PUNCTUATION_CODE_MAP[code];
  if (key === 'Dead' || key.length === 0) return null;
  return key;
};

export const eventToHotkey = (event: KeyEventLike, platform: Platform = detectPlatform()): string | null => {
  const key = physicalKey(event);
  if (key === null) return null;
  const parsed = rawHotkeyToParsedHotkey(
    {
      key,
      ctrl: event.ctrlKey ?? false,
      shift: event.shiftKey ?? false,
      alt: event.altKey ?? false,
      meta: event.metaKey ?? false,
    },
    platform,
  );
  return normalizeHotkeyFromParsed(parsed, platform);
};
