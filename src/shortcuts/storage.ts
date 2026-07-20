import { STORAGE_KEYS } from '../shared/constants';
import type { StorageArea } from '../rules/storage';
import type { ShortcutOverrides } from './registry';
import { shortcutOverridesSchema } from './schema';

export class ShortcutsRepository {
  constructor(private readonly area: StorageArea) {}

  async getOverrides(): Promise<ShortcutOverrides> {
    const stored = await this.area.get([STORAGE_KEYS.shortcuts]);
    return shortcutOverridesSchema.parse(stored[STORAGE_KEYS.shortcuts]) as ShortcutOverrides;
  }

  async save(overrides: ShortcutOverrides): Promise<void> {
    await this.area.set({ [STORAGE_KEYS.shortcuts]: overrides });
  }
}
