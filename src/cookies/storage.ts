import { STORAGE_KEYS } from '../shared/constants';
import type { StorageArea } from '../rules/storage';
import type { CookieSyncState } from './model';
import { cookieSyncStateSchema, legacyCookieSyncStateSchema } from './schema';
import { migrateLegacy } from './tree';

const EMPTY: CookieSyncState = { tree: [] };

export class CookieSyncRepository {
  constructor(private readonly area: StorageArea) {}

  async getAll(): Promise<CookieSyncState> {
    const stored = await this.area.get([STORAGE_KEYS.cookieSync]);
    const value = stored[STORAGE_KEYS.cookieSync];
    const parsed = cookieSyncStateSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    const legacy = legacyCookieSyncStateSchema.safeParse(value);
    if (legacy.success) return { tree: migrateLegacy(legacy.data.mappings) };
    return EMPTY;
  }

  async save(state: CookieSyncState): Promise<void> {
    await this.area.set({ [STORAGE_KEYS.cookieSync]: state });
  }
}
