import { describe, expect, it } from "vitest";
import type { FolderNode, Rule, RuleNode, TreeNode } from "./model";
import {
  dropTarget,
  emptyZoneId,
  projectDropPosition,
  ROOT_ZONE_ID,
} from "./tree-locate";

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: "rule-1",
  name: "test rule",
  enabled: true,
  matchers: { url: { pattern: "https://api.example.com/*", kind: "glob" } },
  actions: [{ type: "rewriteBody", body: "x" }],
  ...overrides,
});

const ruleNode = (id: string): RuleNode => ({
  kind: "rule",
  rule: buildRule({ id }),
});

const folder = (id: string, children: TreeNode[] = []): FolderNode => ({
  kind: "folder",
  id,
  name: id,
  collapsed: false,
  children,
});

const rect = { top: 100, height: 20 };

describe("projectDropPosition", () => {
  it("should return before if the pointer is in the top half of a rule row", () => {
    expect(projectDropPosition(104, rect, false)).toBe("before");
  });

  it("should return after if the pointer is in the bottom half of a rule row", () => {
    expect(projectDropPosition(116, rect, false)).toBe("after");
  });

  it("should never return inside over a rule row", () => {
    expect(projectDropPosition(110, rect, false)).not.toBe("inside");
  });

  it("should return before if the pointer is near the top of a folder row", () => {
    expect(projectDropPosition(102, rect, true)).toBe("before");
  });

  it("should return inside if the pointer is in the middle band of a folder row", () => {
    expect(projectDropPosition(110, rect, true)).toBe("inside");
  });

  it("should return after if the pointer is near the bottom of a folder row", () => {
    expect(projectDropPosition(119, rect, true)).toBe("after");
  });
});

describe("dropTarget", () => {
  it("should target the root slot before a sibling if dropping before it", () => {
    const tree: TreeNode[] = [ruleNode("r1"), ruleNode("r2"), ruleNode("r3")];
    expect(dropTarget(tree, "r3", "r1", "before")).toEqual({
      parentId: null,
      index: 0,
    });
  });

  it("should target inside a folder if position is inside", () => {
    const tree: TreeNode[] = [folder("f", [ruleNode("r1")]), ruleNode("r2")];
    expect(dropTarget(tree, "r2", "f", "inside")).toEqual({
      parentId: "f",
      index: 1,
    });
  });

  it("should compensate the index for the dragged node removal if an earlier sibling moves after a later one", () => {
    const tree: TreeNode[] = [ruleNode("r1"), ruleNode("r2"), ruleNode("r3")];
    // r1 (index 0) dropped after r3 (index 2). raw index = 3; r1 removed from the
    // same parent below the drop point shifts it down 1 -> final index 2.
    expect(dropTarget(tree, "r1", "r3", "after")).toEqual({
      parentId: null,
      index: 2,
    });
  });

  it("should not compensate if a later sibling moves before an earlier one", () => {
    const tree: TreeNode[] = [ruleNode("r1"), ruleNode("r2"), ruleNode("r3")];
    expect(dropTarget(tree, "r3", "r2", "before")).toEqual({
      parentId: null,
      index: 1,
    });
  });

  it("should target the end of root if dropping on the root zone (out to root)", () => {
    const tree: TreeNode[] = [folder("f", [ruleNode("r1")]), ruleNode("r2")];
    expect(dropTarget(tree, "r1", ROOT_ZONE_ID, "inside")).toEqual({
      parentId: null,
      index: 2,
    });
  });

  it("should target inside an empty folder if dropping on its empty zone (TC-003)", () => {
    const tree: TreeNode[] = [folder("empty"), ruleNode("r1")];
    expect(dropTarget(tree, "r1", emptyZoneId("empty"), "inside")).toEqual({
      parentId: "empty",
      index: 0,
    });
  });
});
