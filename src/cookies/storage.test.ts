import { describe, expect, it } from "vitest";
import type { StorageArea } from "../rules/storage";
import { STORAGE_KEYS } from "../shared/constants";
import type { CookieMapping } from "./model";
import { CookieSyncRepository } from "./storage";

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
  id: "cm1",
  name: "test",
  enabled: true,
  sourceUrl: "https://app.prod.com",
  targetUrl: "http://localhost:3000",
  cookieNames: ["auth"],
  ...over,
});

const mappingNode = (over: Partial<CookieMapping> = {}) => ({
  kind: "mapping" as const,
  mapping: mapping(over),
});

describe("CookieSyncRepository", () => {
  it("should return an empty tree when the key is missing (TC-003)", async () => {
    const repo = new CookieSyncRepository(createFakeStorageArea());
    expect(await repo.getAll()).toEqual({ tree: [] });
  });

  it("should return an empty tree when the stored value is malformed (TC-003)", async () => {
    const repo = new CookieSyncRepository(
      createFakeStorageArea({
        [STORAGE_KEYS.cookieSync]: {
          tree: [{ kind: "mapping", mapping: { id: "x" } }],
        },
      }),
    );
    expect(await repo.getAll()).toEqual({ tree: [] });
  });

  it("should return the parsed tree when the stored value is valid (TC-003)", async () => {
    const state = { tree: [mappingNode(), mappingNode({ id: "cm2" })] };
    const repo = new CookieSyncRepository(
      createFakeStorageArea({ [STORAGE_KEYS.cookieSync]: state }),
    );
    expect(await repo.getAll()).toEqual(state);
  });

  it("should migrate a legacy flat {mappings} store to a single-level tree (TC-001)", async () => {
    const repo = new CookieSyncRepository(
      createFakeStorageArea({
        [STORAGE_KEYS.cookieSync]: {
          mappings: [mapping(), mapping({ id: "cm2" })],
        },
      }),
    );
    expect(await repo.getAll()).toEqual({
      tree: [
        { kind: "mapping", mapping: mapping() },
        { kind: "mapping", mapping: mapping({ id: "cm2" }) },
      ],
    });
  });

  it("should persist the tree under the cookie sync key (TC-003)", async () => {
    const area = createFakeStorageArea();
    const repo = new CookieSyncRepository(area);
    const state = { tree: [mappingNode()] };

    await repo.save(state);

    expect(area.backing[STORAGE_KEYS.cookieSync]).toEqual(state);
  });
});
