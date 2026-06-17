import { describe, it, expect } from 'vitest';
import type { Rule } from './model';
import { STORAGE_KEYS } from '../shared/constants';
import { RuleRepository, type StorageArea } from './storage';

const createFakeStorageArea = (
  initial: Record<string, unknown> = {},
): StorageArea & { backing: Record<string, unknown> } => {
  const backing: Record<string, unknown> = { ...initial };
  return {
    backing,
    get: async (keys: string[]) => {
      const out: Record<string, unknown> = {};
      keys.forEach((key) => {
        if (key in backing) {
          out[key] = backing[key];
        }
      });
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    },
  };
};

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  priority: 0,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'block' }],
  ...overrides,
});

describe('RuleRepository.getAll', () => {
  it('should return an empty array if storage is empty', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    expect(await repo.getAll()).toEqual([]);
  });

  it('should return rules ordered by priority ascending (TC-001)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.add(buildRule({ id: 'a', priority: 2 }));
    await repo.add(buildRule({ id: 'b', priority: 1 }));
    const all = await repo.getAll();
    expect(all.map((rule) => rule.id)).toEqual(['b', 'a']);
  });
});

describe('RuleRepository.add', () => {
  it('should persist an added rule so it is readable back (AC-001)', async () => {
    const area = createFakeStorageArea();
    const repo = new RuleRepository(area);
    const rule = buildRule({ id: 'a' });
    await repo.add(rule);
    expect(await repo.getAll()).toEqual([rule]);
  });

  it('should write the added rule under the rules storage key (side-effect-contract)', async () => {
    const area = createFakeStorageArea();
    const repo = new RuleRepository(area);
    await repo.add(buildRule({ id: 'a' }));
    expect(area.backing[STORAGE_KEYS.rules]).toBeDefined();
  });

  it('should preserve previously added rules when adding another (AC-002)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.add(buildRule({ id: 'a', priority: 0 }));
    await repo.add(buildRule({ id: 'b', priority: 1 }));
    const ids = (await repo.getAll()).map((rule) => rule.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });
});

describe('RuleRepository.update', () => {
  it('should replace the matching rule by id (AC-002)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.add(buildRule({ id: 'a', name: 'before' }));
    await repo.update(buildRule({ id: 'a', name: 'after' }));
    const updated = (await repo.getAll()).find((rule) => rule.id === 'a');
    expect(updated?.name).toBe('after');
  });

  it('should leave other rules unchanged when updating one (TC-002)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    const ruleB = buildRule({ id: 'b', name: 'B', priority: 1 });
    await repo.add(buildRule({ id: 'a', name: 'A', priority: 0 }));
    await repo.add(ruleB);
    await repo.update(buildRule({ id: 'a', name: 'A-changed', priority: 0 }));
    const stored = (await repo.getAll()).find((rule) => rule.id === 'b');
    expect(stored).toEqual(ruleB);
  });
});

describe('RuleRepository.remove', () => {
  it('should drop the rule with the given id and keep the others (TC-003)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.add(buildRule({ id: 'a', priority: 0 }));
    await repo.add(buildRule({ id: 'b', priority: 1 }));
    await repo.remove('a');
    const ids = (await repo.getAll()).map((rule) => rule.id);
    expect(ids).not.toContain('a');
    expect(ids).toContain('b');
  });
});

describe('RuleRepository.reorder', () => {
  it('should assign priority equal to the index in the given id order (TC-004, AC-002)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.add(buildRule({ id: 'a', priority: 0 }));
    await repo.add(buildRule({ id: 'b', priority: 1 }));
    await repo.add(buildRule({ id: 'c', priority: 2 }));
    await repo.reorder(['c', 'a', 'b']);
    const byId = Object.fromEntries(
      (await repo.getAll()).map((rule) => [rule.id, rule.priority]),
    );
    expect(byId).toEqual({ c: 0, a: 1, b: 2 });
  });

  it('should return rules ordered by the new priorities after reorder (TC-004)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.add(buildRule({ id: 'a', priority: 0 }));
    await repo.add(buildRule({ id: 'b', priority: 1 }));
    await repo.reorder(['b', 'a']);
    expect((await repo.getAll()).map((rule) => rule.id)).toEqual(['b', 'a']);
  });
});

describe('RuleRepository.getGlobalEnabled', () => {
  it('should default to true when storage is empty (AC-003, edge case)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    expect(await repo.getGlobalEnabled()).toBe(true);
  });

  it('should read back a persisted false value (AC-003)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.setGlobalEnabled(false);
    expect(await repo.getGlobalEnabled()).toBe(false);
  });
});

describe('RuleRepository.setGlobalEnabled', () => {
  it('should persist under the globalEnabled storage key (side-effect-contract)', async () => {
    const area = createFakeStorageArea();
    const repo = new RuleRepository(area);
    await repo.setGlobalEnabled(false);
    expect(area.backing[STORAGE_KEYS.globalEnabled]).toBe(false);
  });

  it('should not touch the stored rules when toggling the global flag (TC-005)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.add(buildRule({ id: 'a', priority: 0 }));
    await repo.add(buildRule({ id: 'b', priority: 1 }));
    const before = await repo.getAll();
    await repo.setGlobalEnabled(false);
    expect(await repo.getAll()).toEqual(before);
    expect(await repo.getGlobalEnabled()).toBe(false);
  });
});
