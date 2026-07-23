import { describe, expect, it } from "vitest";
import { SHORTCUT_ACTIONS, type ShortcutOverrides } from "./registry";
import { findConflict, resolveShortcuts, safeNormalize } from "./resolve";

describe("safeNormalize", () => {
  // TC-002 behavior: a valid combo canonicalizes to itself.
  it("should return the normalized string if the input is a valid hotkey", () => {
    expect(safeNormalize("Mod+S")).toBe("Mod+S");
  });

  // TC-002 behavior: lower-case modifier+key canonicalizes to the uppercase form.
  it("should canonicalize a lower-case modifier+key into the uppercase form", () => {
    expect(safeNormalize("mod+s")).toBe("Mod+S");
  });

  // TC-005 behavior: garbage is rejected.
  it("should return null if the input is garbage", () => {
    expect(safeNormalize("not a hotkey!!")).toBeNull();
  });

  // TC-005 behavior: empty string is rejected.
  it("should return null if the input is an empty string", () => {
    expect(safeNormalize("")).toBeNull();
  });
});

describe("resolveShortcuts", () => {
  // TC-002 behavior: an empty override map yields every registry default as a
  // one-element list.
  it("should return every action default as a one-element list if no overrides are given", () => {
    const effective = resolveShortcuts({});
    SHORTCUT_ACTIONS.forEach((action) => {
      expect(effective[action.id]).toEqual([action.defaultHotkey]);
    });
  });

  // TC-003 behavior: a valid override replaces the default for its id only.
  it("should replace the default with a valid override list", () => {
    const overrides: ShortcutOverrides = { "save-rule": ["Mod+E"] };
    const effective = resolveShortcuts(overrides);
    expect(effective["save-rule"]).toEqual(["Mod+E"]);
  });

  // TC-003 behavior: overriding one action leaves the others at their default.
  it("should keep the defaults for actions without an override", () => {
    const effective = resolveShortcuts({ "save-rule": ["Mod+E"] });
    const toggleTheme = SHORTCUT_ACTIONS.find((a) => a.id === "toggle-theme")!;
    expect(effective["toggle-theme"]).toEqual([toggleTheme.defaultHotkey]);
  });

  // TC-004 behavior: an explicit empty array disables the action (stays empty).
  it("should keep an explicit empty override as an empty list (disabled)", () => {
    const effective = resolveShortcuts({ "save-rule": [] });
    expect(effective["save-rule"]).toEqual([]);
  });

  // TC-005 behavior: an invalid entry is dropped from the override list.
  it("should drop an invalid hotkey entry from an override list", () => {
    const effective = resolveShortcuts({ "save-rule": ["Mod+E", "bogus!!"] });
    expect(effective["save-rule"]).toEqual(["Mod+E"]);
  });

  // TC-005 behavior: a non-array override value falls back to the default.
  it("should fall back to the default if an override value is not an array", () => {
    const overrides = { "save-rule": 42 } as unknown as ShortcutOverrides;
    const def = SHORTCUT_ACTIONS.find(
      (a) => a.id === "save-rule",
    )?.defaultHotkey;
    expect(resolveShortcuts(overrides)["save-rule"]).toEqual([def]);
  });

  // TC-005 behavior: an unknown action id is ignored, defaults preserved.
  it("should ignore an override for an unknown action id and keep all defaults", () => {
    const overrides = { bogus: ["Mod+Q"] } as unknown as ShortcutOverrides;
    const effective = resolveShortcuts(overrides);
    expect(effective).not.toHaveProperty("bogus");
    SHORTCUT_ACTIONS.forEach((action) => {
      expect(effective[action.id]).toEqual([action.defaultHotkey]);
    });
  });

  // TC-005 behavior: a corrupt overrides map does not throw.
  it("should not throw on a corrupt overrides map", () => {
    const overrides = {
      "save-rule": 42,
      bogus: "Mod+Q",
    } as unknown as ShortcutOverrides;
    expect(() => resolveShortcuts(overrides)).not.toThrow();
  });
});

describe("findConflict", () => {
  // TC-006 behavior: Mod+S (save-rule's default) recorded for delete-item names save-rule.
  it("should return the owning action id if another action holds the hotkey", () => {
    const effective = resolveShortcuts({});
    expect(findConflict("Mod+S", "delete-item", effective)).toBe("save-rule");
  });

  // TC-006 behavior: normalized equality (casing) still finds the owner.
  it("should match on normalized equality if the candidate differs only in casing", () => {
    const effective = resolveShortcuts({});
    expect(findConflict("mod+s", "delete-item", effective)).toBe("save-rule");
  });

  // TC-007 behavior: an unbound combo returns null.
  it("should return null if the hotkey is not owned by any other action", () => {
    const effective = resolveShortcuts({});
    expect(findConflict("Mod+Shift+Q", "delete-item", effective)).toBeNull();
  });

  // TC-007 behavior: the action being edited is ignored (self is not a conflict).
  it("should ignore the action being edited when checking for a conflict", () => {
    const effective = resolveShortcuts({});
    expect(findConflict("Mod+S", "save-rule", effective)).toBeNull();
  });

  // TC-007 behavior: a garbage candidate is not a conflict.
  it("should return null if the candidate is not a valid hotkey", () => {
    const effective = resolveShortcuts({});
    expect(findConflict("bogus!!", "delete-item", effective)).toBeNull();
  });
});
