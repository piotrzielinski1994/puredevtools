import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import browser from 'webextension-polyfill';
import { STORAGE_KEYS } from '../../shared/constants';
import type { ShortcutActionId, ShortcutOverrides } from '../../shortcuts/registry';
import { resolveShortcuts, safeNormalize } from '../../shortcuts/resolve';
import { shortcutOverridesSchema } from '../../shortcuts/schema';
import { ShortcutsContext, type ShortcutsContextValue } from './shortcutsContext';

export { useShortcutOverrides, useShortcuts } from './shortcutsContext';
export type { ShortcutMutators } from './shortcutsContext';

const readOverrides = async (): Promise<ShortcutOverrides> => {
  const stored = await browser.storage.local.get([STORAGE_KEYS.shortcuts]);
  return shortcutOverridesSchema.parse(stored[STORAGE_KEYS.shortcuts]) as ShortcutOverrides;
};

const writeOverrides = async (overrides: ShortcutOverrides): Promise<void> => {
  await browser.storage.local.set({ [STORAGE_KEYS.shortcuts]: overrides });
};

export const ShortcutsProvider = ({ children }: { children: ReactNode }) => {
  const [overrides, setOverrides] = useState<ShortcutOverrides>({});
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  useEffect(() => {
    let active = true;
    void readOverrides()
      .then((loaded) => {
        if (active) setOverrides(loaded);
      })
      .catch(() => undefined);
    const listener = (
      changes: Record<string, browser.Storage.StorageChange>,
      areaName: string,
    ): void => {
      if (areaName !== 'local') return;
      const change = changes[STORAGE_KEYS.shortcuts];
      if (change) setOverrides(shortcutOverridesSchema.parse(change.newValue) as ShortcutOverrides);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const update = useCallback((next: (base: ShortcutOverrides) => ShortcutOverrides) => {
    const nextOverrides = next(overridesRef.current);
    overridesRef.current = nextOverrides;
    setOverrides(nextOverrides);
    void writeOverrides(nextOverrides);
  }, []);

  const addShortcut = useCallback(
    (id: ShortcutActionId, hotkey: string) =>
      update((base) => {
        const normalized = safeNormalize(hotkey);
        if (normalized === null) return base;
        const current = resolveShortcuts(base)[id];
        if (current.includes(normalized)) return base;
        return { ...base, [id]: [...current, normalized] };
      }),
    [update],
  );

  const removeShortcut = useCallback(
    (id: ShortcutActionId, hotkey: string) =>
      update((base) => {
        const normalized = safeNormalize(hotkey) ?? hotkey;
        const current = resolveShortcuts(base)[id];
        return { ...base, [id]: current.filter((binding) => binding !== normalized) };
      }),
    [update],
  );

  const replaceShortcut = useCallback(
    (id: ShortcutActionId, oldHotkey: string, newHotkey: string) =>
      update((base) => {
        const normalizedNew = safeNormalize(newHotkey);
        if (normalizedNew === null) return base;
        const normalizedOld = safeNormalize(oldHotkey) ?? oldHotkey;
        const current = resolveShortcuts(base)[id];
        if (!current.includes(normalizedOld)) return base;
        const swapped = current.map((binding) => (binding === normalizedOld ? normalizedNew : binding));
        return { ...base, [id]: swapped.filter((binding, index) => swapped.indexOf(binding) === index) };
      }),
    [update],
  );

  const resetShortcut = useCallback(
    (id: ShortcutActionId) =>
      update((base) => Object.fromEntries(Object.entries(base).filter(([key]) => key !== id))),
    [update],
  );

  const value: ShortcutsContextValue = {
    overrides,
    addShortcut,
    removeShortcut,
    replaceShortcut,
    resetShortcut,
  };

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
};
