import { describe, expect, it } from "vitest";
import { cloneRule } from "./clone";
import type { Rule } from "./model";

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: "rule-1",
  name: "original",
  enabled: true,
  matchers: {
    url: { pattern: "https://api.x/*", kind: "glob" },
    methods: ["GET", "POST"],
  },
  actions: [
    {
      type: "modifyResponseHeaders",
      headers: [{ op: "set", name: "X-Env", value: "staging" }],
    },
  ],
  ...overrides,
});

describe("cloneRule", () => {
  it("should assign the provided new id", () => {
    expect(cloneRule(buildRule(), "rule-2").id).toBe("rule-2");
  });

  it("should suffix the name with (copy)", () => {
    expect(cloneRule(buildRule({ name: "my rule" }), "rule-2").name).toBe(
      "my rule (copy)",
    );
  });

  it("should preserve matchers and actions by value", () => {
    const clone = cloneRule(buildRule(), "rule-2");
    expect(clone.matchers.url).toEqual({
      pattern: "https://api.x/*",
      kind: "glob",
    });
    expect(clone.matchers.methods).toEqual(["GET", "POST"]);
    expect(clone.actions).toEqual([
      {
        type: "modifyResponseHeaders",
        headers: [{ op: "set", name: "X-Env", value: "staging" }],
      },
    ]);
  });

  it("should deep-copy arrays so mutating the clone does not affect the original", () => {
    const original = buildRule();
    const clone = cloneRule(original, "rule-2");
    clone.matchers.methods?.push("DELETE");
    clone.actions.push({ type: "rewriteBody", body: "z" });
    expect(original.matchers.methods).toEqual(["GET", "POST"]);
    expect(original.actions).toHaveLength(1);
  });

  it("should keep the enabled flag from the source rule", () => {
    expect(cloneRule(buildRule({ enabled: false }), "rule-2").enabled).toBe(
      false,
    );
  });
});
