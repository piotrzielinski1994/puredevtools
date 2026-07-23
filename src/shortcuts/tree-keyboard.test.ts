import { describe, expect, it } from "vitest";
import type { FolderNode, Rule, RuleNode, TreeNode } from "../rules/model";
import { resolveShortcuts } from "./resolve";
import {
  expandedFolderIds,
  flattenSelectable,
  resolveTreeKey,
  treeMoveTarget,
} from "./tree-keyboard";

// Runs in the NODE test env (no DOM). detectPlatform() reports "mac" here, so a
// Mod binding resolves to Meta - the custom-binding tests fire metaKey to land
// on "Mod+..". Events are plain bags cast to KeyboardEvent; matchesKeyboardEvent
// reads event.key + the modifier booleans, so a DOM KeyboardEvent is not needed.

const rule = (id: string): Rule => ({
  id,
  name: id,
  enabled: true,
  matchers: { url: { pattern: `https://${id}.test/*`, kind: "glob" } },
  actions: [{ type: "rewriteBody", body: "x" }],
});

const ruleNode = (id: string): RuleNode => ({ kind: "rule", rule: rule(id) });

const folder = (
  id: string,
  children: TreeNode[],
  collapsed = false,
): FolderNode => ({
  kind: "folder",
  id,
  name: id,
  collapsed,
  children,
});

//   f1 (folder)
//     c1 (rule)
//     c2 (rule)
//   f2 (folder, empty)
//   r1 (rule)
const tree: TreeNode[] = [
  folder("f1", [ruleNode("c1"), ruleNode("c2")]),
  folder("f2", []),
  ruleNode("r1"),
];

const expandedAll = new Set(["f1", "f2"]);
const collapsedAll = new Set<string>();

const defaultBindings = resolveShortcuts({});

function keyEvent(
  key: string,
  mods: { shift?: boolean; alt?: boolean; meta?: boolean; ctrl?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
  } as unknown as KeyboardEvent;
}

const resolve = (
  event: KeyboardEvent,
  focusedId: string,
  expandedIds: Set<string> = expandedAll,
  bindings = defaultBindings,
) => resolveTreeKey({ tree, expandedIds, focusedId, event, bindings });

describe("expandedFolderIds", () => {
  // AC-007 behavior: derives the expanded set from folder.collapsed === false.
  it("should include every folder whose collapsed flag is false", () => {
    expect(expandedFolderIds(tree)).toEqual(new Set(["f1", "f2"]));
  });

  // AC-007 behavior: a collapsed folder is excluded from the set.
  it("should exclude a collapsed folder", () => {
    const t: TreeNode[] = [
      folder("f1", [ruleNode("c1")], true),
      folder("f2", []),
    ];
    expect(expandedFolderIds(t)).toEqual(new Set(["f2"]));
  });
});

describe("flattenSelectable", () => {
  // AC-007 behavior: fully expanded, every row is visible in DFS order.
  it("should list every row in pre-order if all folders are expanded", () => {
    expect(flattenSelectable(tree, expandedAll)).toEqual([
      "f1",
      "c1",
      "c2",
      "f2",
      "r1",
    ]);
  });

  // AC-007 behavior: a collapsed folder hides its children.
  it("should hide a collapsed folder children", () => {
    expect(flattenSelectable(tree, collapsedAll)).toEqual(["f1", "f2", "r1"]);
  });
});

describe("resolveTreeKey - navigation (default bindings)", () => {
  // TC-019 behavior: ArrowDown focuses the next visible row.
  it("should focus the next visible row if the tree-nav-down key fires", () => {
    expect(resolve(keyEvent("ArrowDown"), "f1")).toEqual({
      type: "focus",
      id: "c1",
    });
  });

  // TC-019 behavior: ArrowUp focuses the previous visible row.
  it("should focus the previous visible row if the tree-nav-up key fires", () => {
    expect(resolve(keyEvent("ArrowUp"), "c1")).toEqual({
      type: "focus",
      id: "f1",
    });
  });

  // TC-019 behavior: ArrowUp on the first row is a no-op.
  it("should be a no-op if ArrowUp on the first visible row", () => {
    expect(resolve(keyEvent("ArrowUp"), "f1")).toEqual({ type: "none" });
  });

  // TC-019 behavior: ArrowDown on the last row is a no-op.
  it("should be a no-op if ArrowDown on the last visible row", () => {
    expect(resolve(keyEvent("ArrowDown"), "r1")).toEqual({ type: "none" });
  });

  // TC-019 behavior: ArrowDown skips a collapsed folder children.
  it("should skip a collapsed folder children if ArrowDown", () => {
    expect(resolve(keyEvent("ArrowDown"), "f1", collapsedAll)).toEqual({
      type: "focus",
      id: "f2",
    });
  });

  // TC-019 behavior: Home focuses the first visible row.
  it("should focus the first visible row if Home", () => {
    expect(resolve(keyEvent("Home"), "r1")).toEqual({
      type: "focus",
      id: "f1",
    });
  });

  // TC-019 behavior: End focuses the last visible row.
  it("should focus the last visible row if End", () => {
    expect(resolve(keyEvent("End"), "f1")).toEqual({ type: "focus", id: "r1" });
  });
});

describe("resolveTreeKey - activate/toggle (default bindings)", () => {
  // TC-021 behavior: Enter on a rule row activates (opens) it.
  it("should activate a rule if Enter on a rule row", () => {
    expect(resolve(keyEvent("Enter"), "r1")).toEqual({
      type: "activate",
      id: "r1",
    });
  });

  // TC-021 behavior: Enter on a folder row toggles it.
  it("should toggle a folder if Enter on a folder row", () => {
    expect(resolve(keyEvent("Enter"), "f1")).toEqual({
      type: "toggle",
      id: "f1",
    });
  });
});

describe("resolveTreeKey - expand/collapse (default bindings)", () => {
  // TC-020 behavior: ArrowRight expands a collapsed folder.
  it("should expand a collapsed folder if ArrowRight", () => {
    expect(resolve(keyEvent("ArrowRight"), "f1", collapsedAll)).toEqual({
      type: "expand",
      id: "f1",
    });
  });

  // TC-020 behavior: ArrowRight on an expanded folder descends to its first child.
  it("should focus the first child if ArrowRight on an expanded folder", () => {
    expect(resolve(keyEvent("ArrowRight"), "f1", expandedAll)).toEqual({
      type: "focus",
      id: "c1",
    });
  });

  // TC-020 behavior: ArrowLeft collapses an expanded folder.
  it("should collapse an expanded folder if ArrowLeft", () => {
    expect(resolve(keyEvent("ArrowLeft"), "f1", expandedAll)).toEqual({
      type: "collapse",
      id: "f1",
    });
  });

  // TC-020 behavior: ArrowLeft on a child ascends to its parent.
  it("should focus the parent if ArrowLeft on a child", () => {
    expect(resolve(keyEvent("ArrowLeft"), "c1", expandedAll)).toEqual({
      type: "focus",
      id: "f1",
    });
  });
});

describe("resolveTreeKey - alt move (default bindings)", () => {
  // TC-022 behavior: Alt+ArrowDown on a movable row returns a move command.
  it("should return a move command if Alt+ArrowDown on a movable row", () => {
    const command = resolve(keyEvent("ArrowDown", { alt: true }), "f1");
    expect(command.type).toBe("move");
    expect(command).toMatchObject({ id: "f1" });
  });

  // TC-022 behavior: Alt+ArrowUp on the first sibling is a no-op.
  it("should be a no-op if Alt+ArrowUp on the first sibling", () => {
    expect(resolve(keyEvent("ArrowUp", { alt: true }), "c1")).toEqual({
      type: "none",
    });
  });

  // TC-022 behavior: Alt+ArrowLeft on a root node cannot outdent.
  it("should be a no-op if Alt+ArrowLeft on a root node", () => {
    expect(resolve(keyEvent("ArrowLeft", { alt: true }), "f1")).toEqual({
      type: "none",
    });
  });

  // TC-022 behavior: Alt+ArrowRight with no preceding sibling folder is a no-op.
  it("should be a no-op if Alt+ArrowRight with no preceding sibling folder", () => {
    expect(resolve(keyEvent("ArrowRight", { alt: true }), "c1")).toEqual({
      type: "none",
    });
  });
});

describe("resolveTreeKey - modifier leak guard", () => {
  // AC-007 behavior: a bare Meta+ArrowRight matches no tree binding.
  it("should be a no-op if a bare Meta+ArrowRight fires", () => {
    expect(
      resolve(keyEvent("ArrowRight", { meta: true }), "f1", collapsedAll),
    ).toEqual({ type: "none" });
  });

  // AC-007 behavior: a focused id absent from the tree is a no-op.
  it("should be a no-op if the focused id is not in the tree", () => {
    expect(resolve(keyEvent("ArrowDown"), "ghost")).toEqual({ type: "none" });
  });
});

describe("resolveTreeKey - custom bindings", () => {
  // AC-007 behavior: a rebound tree-move-up honours the custom combo, drops the old default.
  it("should honour a rebound tree-move-up key", () => {
    const custom = resolveShortcuts({ "tree-move-up": ["Mod+Shift+ArrowUp"] });
    expect(
      resolve(keyEvent("ArrowUp", { alt: true }), "c2", expandedAll, custom),
    ).toEqual({ type: "none" });
    const command = resolve(
      keyEvent("ArrowUp", { shift: true, meta: true }),
      "c2",
      expandedAll,
      custom,
    );
    expect(command.type).toBe("move");
    expect(command).toMatchObject({ id: "c2" });
  });

  // AC-007 behavior: a disabled ([]) tree action's former default resolves to none.
  it("should be a no-op for a disabled tree action former default key", () => {
    const custom = resolveShortcuts({ "tree-nav-down": [] });
    expect(resolve(keyEvent("ArrowDown"), "f1", expandedAll, custom)).toEqual({
      type: "none",
    });
  });

  // AC-007 behavior: a multi-binding tree action fires on any of its keys.
  it("should honour any binding in a multi-binding tree action", () => {
    const custom = resolveShortcuts({
      "tree-nav-down": ["ArrowDown", "Mod+ArrowDown"],
    });
    expect(resolve(keyEvent("ArrowDown"), "f1", expandedAll, custom)).toEqual({
      type: "focus",
      id: "c1",
    });
    expect(
      resolve(keyEvent("ArrowDown", { meta: true }), "f1", expandedAll, custom),
    ).toEqual({
      type: "focus",
      id: "c1",
    });
  });
});

describe("treeMoveTarget - direction math", () => {
  // TC-022 behavior: moving down among siblings targets the next slot.
  it("should target the slot after the next sibling if moving down among siblings", () => {
    expect(treeMoveTarget(tree, "c1", "down")).toEqual({
      parentId: "f1",
      index: 1,
    });
  });

  // TC-022 behavior: moving up among siblings targets the earlier slot.
  it("should target the earlier slot if moving up among siblings", () => {
    expect(treeMoveTarget(tree, "c2", "up")).toEqual({
      parentId: "f1",
      index: 0,
    });
  });

  // TC-022 behavior: moving up the first sibling is impossible.
  it("should return null if moving up the first sibling", () => {
    expect(treeMoveTarget(tree, "c1", "up")).toBeNull();
  });

  // TC-022 behavior: moving down the last sibling is impossible.
  it("should return null if moving down the last sibling", () => {
    expect(treeMoveTarget(tree, "c2", "down")).toBeNull();
  });

  // TC-022 behavior: outdenting places the node just after its parent in the grandparent.
  it("should place a node just after its parent in the grandparent if outdenting", () => {
    expect(treeMoveTarget(tree, "c1", "outdent")).toEqual({
      parentId: null,
      index: 1,
    });
  });

  // TC-022 behavior: a root node cannot outdent.
  it("should return null if outdenting a root node", () => {
    expect(treeMoveTarget(tree, "r1", "outdent")).toBeNull();
  });

  // TC-022 behavior: nesting appends into the preceding sibling folder.
  it("should append into the preceding sibling folder if nesting", () => {
    expect(treeMoveTarget(tree, "r1", "nest")).toEqual({
      parentId: "f2",
      index: 0,
    });
  });

  // TC-022 behavior: nesting with no preceding sibling folder is impossible.
  it("should return null if nesting with no preceding sibling folder", () => {
    expect(treeMoveTarget(tree, "f1", "nest")).toBeNull();
  });

  // TC-022 behavior: nesting when the preceding sibling is a rule is impossible.
  it("should return null if nesting when the preceding sibling is a rule", () => {
    const t: TreeNode[] = [ruleNode("a"), ruleNode("b")];
    expect(treeMoveTarget(t, "b", "nest")).toBeNull();
  });
});
