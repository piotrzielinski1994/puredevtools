import browser from 'webextension-polyfill';
import { z } from 'zod';
import { STORAGE_KEYS } from '../../shared/constants';
import type { OpenTabsState, TabsStore } from './useOpenTabs';

const EMPTY: OpenTabsState = { openKeys: [], activeKey: null };

const schema = z.object({
  openKeys: z.array(z.string()),
  activeKey: z.string().nullable(),
});

export const createTabsStore = (): TabsStore => ({
  load: async () => {
    const stored = await browser.storage.local.get([STORAGE_KEYS.openTabs]);
    const parsed = schema.safeParse(stored[STORAGE_KEYS.openTabs]);
    return parsed.success ? parsed.data : EMPTY;
  },
  save: (state) => {
    void browser.storage.local.set({ [STORAGE_KEYS.openTabs]: state });
  },
});
