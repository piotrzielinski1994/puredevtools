// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';
import { createTabsStore } from './createTabsStore';

vi.mock('webextension-polyfill', () => {
  const backing: Record<string, unknown> = {};
  return {
    default: {
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            keys.forEach((key) => {
              if (key in backing) out[key] = backing[key];
            });
            return out;
          }),
          set: vi.fn(async (entries: Record<string, unknown>) => {
            Object.assign(backing, entries);
          }),
        },
      },
    },
  };
});

const OPEN_TABS_KEY = 'puredevtools.openTabs';
const RULES_KEY = 'puredevtools.rules';

const local = browser.storage.local as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  local.get.mockClear();
  local.set.mockClear();
});

describe('createTabsStore', () => {
  it('should resolve to an empty state if the stored value is malformed (TC-005)', async () => {
    // behavior: non-conforming stored object → empty state, no throw
    local.get.mockResolvedValueOnce({ [OPEN_TABS_KEY]: { openKeys: 'nope' } });

    const state = await createTabsStore().load();

    expect(state).toEqual({ openKeys: [], activeKey: null });
  });

  it('should resolve to an empty state if the key is missing', async () => {
    // behavior: absent key → empty state
    local.get.mockResolvedValueOnce({});

    const state = await createTabsStore().load();

    expect(state).toEqual({ openKeys: [], activeKey: null });
  });

  it('should round-trip a saved state under the dedicated open-tabs key (AC-007)', async () => {
    // side-effect-contract: save writes under puredevtools.openTabs and load reads it back
    const store = createTabsStore();

    store.save({ openKeys: ['x'], activeKey: 'x' });
    await vi.waitFor(() => expect(local.set).toHaveBeenCalled());

    const [entries] = local.set.mock.calls[0] as [Record<string, unknown>];
    expect(entries).toHaveProperty(OPEN_TABS_KEY);
    expect(entries[OPEN_TABS_KEY]).toEqual({ openKeys: ['x'], activeKey: 'x' });

    const restored = await store.load();
    expect(restored).toEqual({ openKeys: ['x'], activeKey: 'x' });
  });

  it('should never write to the rules key when saving open tabs (AC-007)', async () => {
    // side-effect-contract: persisting tabs must not mutate the rules storage key
    createTabsStore().save({ openKeys: ['x'], activeKey: 'x' });

    await vi.waitFor(() => expect(local.set).toHaveBeenCalled());
    local.set.mock.calls.forEach((call) => {
      const [entries] = call as [Record<string, unknown>];
      expect(entries).not.toHaveProperty(RULES_KEY);
    });
  });
});
