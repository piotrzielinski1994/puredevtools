import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS } from '../shared/constants';
import type { StorageArea } from '../rules/storage';
import type { CookieMapping } from './model';
import { CookieSyncRepository } from './storage';

const createFakeStorageArea = (
  initial: Record<string, unknown> = {},
): StorageArea & { backing: Record<string, unknown> } => {
  const backing: Record<string, unknown> = { ...initial };
  return {
    backing,
    get: async (keys: string[]) => {
      const out: Record<string, unknown> = {};
      keys.forEach((key) => {
        if (key in backing) out[key] = backing[key];
      });
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    },
  };
};

const mapping = (over: Partial<CookieMapping> = {}): CookieMapping => ({
  id: 'cm1',
  name: 'test',
  enabled: true,
  sourceUrl: 'https://app.prod.com',
  targetUrl: 'http://localhost:3000',
  cookieNames: ['auth'],
  ...over,
});

describe('CookieSyncRepository', () => {
  it('should return an empty state when the key is missing (TC-003)', async () => {
    const repo = new CookieSyncRepository(createFakeStorageArea());
    expect(await repo.getAll()).toEqual({ mappings: [] });
  });

  it('should return an empty state when the stored value is malformed (TC-003)', async () => {
    const repo = new CookieSyncRepository(
      createFakeStorageArea({ [STORAGE_KEYS.cookieSync]: { mappings: [{ id: 'x' }] } }),
    );
    expect(await repo.getAll()).toEqual({ mappings: [] });
  });

  it('should return the parsed state when the stored value is valid (TC-003)', async () => {
    const state = { mappings: [mapping(), mapping({ id: 'cm2' })] };
    const repo = new CookieSyncRepository(
      createFakeStorageArea({ [STORAGE_KEYS.cookieSync]: state }),
    );
    expect(await repo.getAll()).toEqual(state);
  });

  it('should persist the state under the cookie sync key (TC-003)', async () => {
    const area = createFakeStorageArea();
    const repo = new CookieSyncRepository(area);
    const state = { mappings: [mapping()] };

    await repo.save(state);

    expect(area.backing[STORAGE_KEYS.cookieSync]).toEqual(state);
  });
});
