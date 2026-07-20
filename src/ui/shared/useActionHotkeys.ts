import { useHotkeys, type UseHotkeyDefinition } from '@tanstack/react-hotkeys';
import type { Hotkey } from '@tanstack/hotkeys';
import type { ShortcutActionId } from '../../shortcuts/registry';
import { resolveShortcuts } from '../../shortcuts/resolve';
import { useShortcutOverrides } from './ShortcutsProvider';

export const useActionHotkeys = (handlers: Partial<Record<ShortcutActionId, () => void>>): void => {
  const effective = resolveShortcuts(useShortcutOverrides());
  const definitions: UseHotkeyDefinition[] = (Object.keys(handlers) as ShortcutActionId[]).flatMap((id) =>
    effective[id].map((hotkey) => ({
      hotkey: hotkey as Hotkey,
      callback: () => {
        handlers[id]?.();
      },
    })),
  );
  useHotkeys(definitions);
};
