// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyTheme, DEFAULT_THEME, normalizeTheme } from "./theme";

describe("normalizeTheme", () => {
  it('should return dark only for the exact "dark" string', () => {
    expect(normalizeTheme("dark")).toBe("dark");
  });

  it("should fall back to light for anything else", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme(undefined)).toBe("light");
    expect(normalizeTheme(null)).toBe("light");
    expect(normalizeTheme("DARK")).toBe("light");
    expect(normalizeTheme(42)).toBe("light");
  });

  it("should default to light", () => {
    expect(DEFAULT_THEME).toBe("light");
  });
});

describe("applyTheme", () => {
  it("should add the dark class on the root when theme is dark", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("should remove the dark class on the root when theme is light", () => {
    const root = document.createElement("html");
    root.classList.add("dark");
    applyTheme("light", root);
    expect(root.classList.contains("dark")).toBe(false);
  });
});
