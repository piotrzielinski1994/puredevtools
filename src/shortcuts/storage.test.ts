import { describe, expect, it } from "vitest";
import type { StorageArea } from "../rules/storage";
import { STORAGE_KEYS } from "../shared/constants";
import type { ShortcutOverrides } from "./registry";
import { ShortcutsRepository } from "./storage";

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

describe("ShortcutsRepository", () => {
  // behavior: a missing key yields an empty overrides map.
  it("should return an empty overrides map when the key is missing", async () => {
    const repo = new ShortcutsRepository(createFakeStorageArea());
    expect(await repo.getOverrides()).toEqual({});
  });

  // TC-032 behavior: a malformed stored value falls back to {} (schema .catch).
  it("should return an empty overrides map when the stored value is malformed", async () => {
    const repo = new ShortcutsRepository(
      createFakeStorageArea({ [STORAGE_KEYS.shortcuts]: "not an object" }),
    );
    expect(await repo.getOverrides()).toEqual({});
  });

  // behavior: a valid stored value is parsed and returned.
  it("should return the parsed overrides when the stored value is valid", async () => {
    const overrides: ShortcutOverrides = {
      "save-rule": ["Mod+E"],
      "toggle-theme": [],
    };
    const repo = new ShortcutsRepository(
      createFakeStorageArea({ [STORAGE_KEYS.shortcuts]: overrides }),
    );
    expect(await repo.getOverrides()).toEqual(overrides);
  });

  // side-effect-contract: save persists under the shortcuts key.
  it("should persist the overrides under the shortcuts key", async () => {
    const area = createFakeStorageArea();
    const repo = new ShortcutsRepository(area);
    const overrides: ShortcutOverrides = { "save-rule": ["Mod+E"] };

    await repo.save(overrides);

    expect(area.backing[STORAGE_KEYS.shortcuts]).toEqual(overrides);
  });

  // TC-032 side-effect-contract: a saved value round-trips back through getOverrides.
  it("should round-trip a saved overrides map back through getOverrides", async () => {
    const area = createFakeStorageArea();
    const repo = new ShortcutsRepository(area);
    const overrides: ShortcutOverrides = {
      "delete-item": ["Mod+Alt+D"],
      "save-rule": [],
    };

    await repo.save(overrides);

    expect(await repo.getOverrides()).toEqual(overrides);
  });
});
