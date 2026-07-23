import { describe, expect, it } from "vitest";
import { mergeRules } from "./merge";
import type { FolderNode, Rule, RuleNode, TreeNode } from "./model";

const buildRule = (id: string, overrides: Partial<Rule> = {}): Rule => ({
  id,
  name: id,
  enabled: true,
  matchers: { url: { pattern: `https://${id}.x/*`, kind: "glob" } },
  actions: [{ type: "rewriteBody", body: "x" }],
  ...overrides,
});

const ruleNode = (id: string, overrides: Partial<Rule> = {}): RuleNode => ({
  kind: "rule",
  rule: buildRule(id, overrides),
});

const folder = (id: string, children: TreeNode[] = []): FolderNode => ({
  kind: "folder",
  id,
  name: id,
  collapsed: false,
  children,
});

const rootIds = (tree: TreeNode[]): string[] =>
  tree.map((node) => (node.kind === "rule" ? node.rule.id : node.id));

const walkRuleIds = (tree: TreeNode[]): string[] =>
  tree.flatMap((node) =>
    node.kind === "rule" ? [node.rule.id] : walkRuleIds(node.children),
  );

describe("mergeRules", () => {
  it("should append imported roots after the current roots", () => {
    const result = mergeRules([ruleNode("a")], [ruleNode("b")]);
    expect(rootIds(result)).toEqual(["a", "b"]);
  });

  it("should re-suffix a colliding imported rule id instead of overwriting the current rule", () => {
    const result = mergeRules(
      [ruleNode("a", { name: "current a" })],
      [ruleNode("a", { name: "imported a" })],
    );
    expect(walkRuleIds(result)).toEqual(["a", "a-imported"]);
  });

  it("should keep escalating the suffix when the renamed rule id also collides", () => {
    const result = mergeRules(
      [ruleNode("a"), ruleNode("a-imported")],
      [ruleNode("a")],
    );
    expect(walkRuleIds(result)).toEqual(["a", "a-imported", "a-imported-2"]);
  });

  it("should re-suffix a colliding imported folder id", () => {
    const result = mergeRules([folder("f")], [folder("f")]);
    expect(rootIds(result)).toEqual(["f", "f-imported"]);
  });

  it("should re-suffix a duplicate rule id nested inside an imported folder", () => {
    const result = mergeRules([ruleNode("a")], [folder("f", [ruleNode("a")])]);
    expect(walkRuleIds(result).sort()).toEqual(["a", "a-imported"]);
  });

  it("should return only the current roots when nothing is imported", () => {
    expect(rootIds(mergeRules([ruleNode("a")], []))).toEqual(["a"]);
  });
});
