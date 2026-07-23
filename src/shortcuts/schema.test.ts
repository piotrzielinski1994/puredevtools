import { describe, expect, it } from "vitest";
import { shortcutOverridesSchema } from "./schema";

describe("shortcutOverridesSchema", () => {
  // TC-032 behavior: a well-formed overrides map round-trips unchanged.
  it("should parse a valid overrides map", () => {
    const value = { "save-rule": ["Mod+E"], "toggle-theme": [] };
    const parsed = shortcutOverridesSchema.parse(value);
    expect(parsed).toEqual(value);
  });

  // TC-032 behavior: an empty map is valid.
  it("should parse an empty overrides map", () => {
    expect(shortcutOverridesSchema.parse({})).toEqual({});
  });

  // TC-032 behavior: a malformed stored value falls back to {} via .catch.
  it("should fall back to an empty map if the stored value is a non-object", () => {
    expect(shortcutOverridesSchema.parse("garbage")).toEqual({});
  });

  // TC-032 behavior: null falls back to {}.
  it("should fall back to an empty map if the stored value is null", () => {
    expect(shortcutOverridesSchema.parse(null)).toEqual({});
  });

  // TC-032 behavior: a map whose value is the wrong shape falls back to {}.
  it("should fall back to an empty map if an override value is not a string array", () => {
    expect(shortcutOverridesSchema.parse({ "save-rule": 42 })).toEqual({});
  });

  // TC-032 behavior: a disabled ([]) override is a valid value that survives parsing.
  it("should keep an explicit empty-array override", () => {
    expect(shortcutOverridesSchema.parse({ "save-rule": [] })).toEqual({
      "save-rule": [],
    });
  });
});
