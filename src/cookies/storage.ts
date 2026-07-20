import { STORAGE_KEYS } from '../shared/constants';
import type { StorageArea } from '../rules/storage';
import type { CookieSyncState } from './model';
import { cookieSyncStateSchema } from './schema';

const EMPTY: CookieSyncState = { mappings: [] };

export class CookieSyncRepository {
  constructor(private readonly area: StorageArea) {}

  async getAll(): Promise<CookieSyncState> {
    const stored = await this.area.get([STORAGE_KEYS.cookieSync]);
    const parsed = cookieSyncStateSchema.safeParse(stored[STORAGE_KEYS.cookieSync]);
    return parsed.success ? parsed.data : EMPTY;
  }

  async save(state: CookieSyncState): Promise<void> {
    await this.area.set({ [STORAGE_KEYS.cookieSync]: state });
  }
}
