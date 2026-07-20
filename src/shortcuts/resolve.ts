import { normalizeHotkey, validateHotkey } from '@tanstack/hotkeys';
import { SHORTCUT_ACTIONS, type ShortcutActionId, type ShortcutOverrides } from './registry';

const ACTION_IDS = new Set<string>(SHORTCUT_ACTIONS.map((action) => action.id));

const isShortcutActionId = (value: string): value is ShortcutActionId => ACTION_IDS.has(value);

const ALLOWED_UNKNOWN_KEYS = new Set(['ContextMenu']);

export const safeNormalize = (hotkey: string): string | null => {
  if (typeof hotkey !== 'string' || hotkey.length === 0) return null;
  const result = validateHotkey(hotkey);
  const hasUnknownKey = result.warnings.some(
    (warning) => warning.includes('Unknown key') && !ALLOWED_UNKNOWN_KEYS.has(hotkey.split('+').pop() ?? ''),
  );
  if (!result.valid || hasUnknownKey) return null;
  return normalizeHotkey(hotkey);
};

export const resolveShortcuts = (overrides: ShortcutOverrides): Record<ShortcutActionId, string[]> => {
  const overlay = typeof overrides === 'object' && overrides !== null ? overrides : {};
  return SHORTCUT_ACTIONS.reduce(
    (acc, action) => {
      const candidate = overlay[action.id];
      if (!Array.isArray(candidate)) {
        acc[action.id] = [action.defaultHotkey];
        return acc;
      }
      acc[action.id] = candidate
        .map((entry) => safeNormalize(entry))
        .filter((entry): entry is string => entry !== null);
      return acc;
    },
    {} as Record<ShortcutActionId, string[]>,
  );
};

export const findConflict = (
  hotkey: string,
  forAction: ShortcutActionId,
  effective: Record<ShortcutActionId, string[]>,
): ShortcutActionId | null => {
  const target = safeNormalize(hotkey);
  if (target === null) return null;
  const owner = (Object.keys(effective) as ShortcutActionId[]).find((id) => {
    if (id === forAction || !isShortcutActionId(id)) return false;
    return effective[id].some((binding) => safeNormalize(binding) === target);
  });
  return owner ?? null;
};
