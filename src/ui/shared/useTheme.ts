import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { STORAGE_KEYS } from "../../shared/constants";
import { applyTheme, DEFAULT_THEME, normalizeTheme, type Theme } from "./theme";

const readTheme = async (): Promise<Theme> => {
  const stored = await browser.storage.local.get([STORAGE_KEYS.theme]);
  return normalizeTheme(stored?.[STORAGE_KEYS.theme]);
};

const writeTheme = async (theme: Theme): Promise<void> => {
  await browser.storage.local.set({ [STORAGE_KEYS.theme]: theme });
};

const subscribeTheme = (onChange: (theme: Theme) => void): (() => void) => {
  const listener = (
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== "local") return;
    const change = changes[STORAGE_KEYS.theme];
    if (change) onChange(normalizeTheme(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
};

export const useTheme = (): [Theme, (theme: Theme) => void] => {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    let active = true;
    const root = document.documentElement;
    void readTheme()
      .then((stored) => {
        if (!active) return;
        setTheme(stored);
        applyTheme(stored, root);
      })
      .catch(() => undefined);
    const unsubscribe = subscribeTheme((next) => {
      setTheme(next);
      applyTheme(next, root);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const update = (next: Theme): void => {
    setTheme(next);
    applyTheme(next, document.documentElement);
    void writeTheme(next);
  };

  return [theme, update];
};
