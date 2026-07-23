import { type Hotkey, matchesKeyboardEvent } from "@tanstack/hotkeys";
import type { MoveTarget, NodeLocation, TreeFolder } from "./tree";

export type TreeKeyCommand =
  | { type: "focus"; id: string }
  | { type: "activate"; id: string }
  | { type: "toggle"; id: string }
  | { type: "expand"; id: string }
  | { type: "collapse"; id: string }
  | { type: "move"; id: string; target: MoveTarget }
  | { type: "none" };

export type TreeMoveDirection = "up" | "down" | "outdent" | "nest";

export type TreeActionId =
  | "tree-move-up"
  | "tree-move-down"
  | "tree-outdent"
  | "tree-nest"
  | "tree-nav-up"
  | "tree-nav-down"
  | "tree-nav-first"
  | "tree-nav-last"
  | "tree-activate"
  | "tree-expand"
  | "tree-collapse";

export type TreeBindings = Partial<Record<string, string[]>>;

const NONE: TreeKeyCommand = { type: "none" };

const TREE_ACTION_ORDER: TreeActionId[] = [
  "tree-move-up",
  "tree-move-down",
  "tree-outdent",
  "tree-nest",
  "tree-nav-up",
  "tree-nav-down",
  "tree-nav-first",
  "tree-nav-last",
  "tree-activate",
  "tree-expand",
  "tree-collapse",
];

export type TreeKeyboardDeps<Leaf extends { kind: string }> = {
  nodeId(node: Leaf | TreeFolder<Leaf>): string;
  findNode(
    tree: Array<Leaf | TreeFolder<Leaf>>,
    id: string,
  ): Leaf | TreeFolder<Leaf> | undefined;
  locateNode(
    tree: Array<Leaf | TreeFolder<Leaf>>,
    id: string,
  ): NodeLocation | null;
};

export const createTreeKeyboard = <Leaf extends { kind: string }>(
  deps: TreeKeyboardDeps<Leaf>,
) => {
  type Node = Leaf | TreeFolder<Leaf>;
  const isFolder = (node: Node): node is TreeFolder<Leaf> =>
    node.kind === "folder";

  const expandedFolderIds = (tree: Node[]): Set<string> => {
    const ids = new Set<string>();
    const walk = (nodes: Node[]): void =>
      nodes.forEach((node) => {
        if (!isFolder(node)) return;
        if (!node.collapsed) ids.add(node.id);
        walk(node.children);
      });
    walk(tree);
    return ids;
  };

  const flattenSelectable = (
    tree: Node[],
    expandedIds: Set<string>,
  ): string[] =>
    tree.flatMap((node) => {
      if (!isFolder(node)) return [deps.nodeId(node)];
      if (!expandedIds.has(node.id)) return [node.id];
      return [node.id, ...flattenSelectable(node.children, expandedIds)];
    });

  const childrenOf = (tree: Node[], parentId: string | null): Node[] => {
    if (parentId === null) return tree;
    const parent = deps.findNode(tree, parentId);
    return parent && isFolder(parent) ? parent.children : [];
  };

  const treeMoveTarget = (
    tree: Node[],
    id: string,
    direction: TreeMoveDirection,
  ): MoveTarget | null => {
    const location = deps.locateNode(tree, id);
    if (!location) return null;
    const siblings = childrenOf(tree, location.parentId);

    if (direction === "up") {
      if (location.index === 0) return null;
      return { parentId: location.parentId, index: location.index - 1 };
    }
    if (direction === "down") {
      if (location.index >= siblings.length - 1) return null;
      return { parentId: location.parentId, index: location.index + 1 };
    }
    if (direction === "outdent") {
      if (location.parentId === null) return null;
      const parentLocation = deps.locateNode(tree, location.parentId);
      if (!parentLocation) return null;
      return {
        parentId: parentLocation.parentId,
        index: parentLocation.index + 1,
      };
    }
    const preceding = siblings[location.index - 1];
    if (!preceding || !isFolder(preceding)) return null;
    return { parentId: preceding.id, index: preceding.children.length };
  };

  const commandFor = (
    action: TreeActionId,
    tree: Node[],
    expandedIds: Set<string>,
    focusedId: string,
    node: Node,
  ): TreeKeyCommand => {
    const visible = flattenSelectable(tree, expandedIds);
    const index = visible.indexOf(focusedId);

    if (
      action === "tree-move-up" ||
      action === "tree-move-down" ||
      action === "tree-outdent" ||
      action === "tree-nest"
    ) {
      const direction: TreeMoveDirection =
        action === "tree-move-up"
          ? "up"
          : action === "tree-move-down"
            ? "down"
            : action === "tree-outdent"
              ? "outdent"
              : "nest";
      const target = treeMoveTarget(tree, focusedId, direction);
      return target ? { type: "move", id: focusedId, target } : NONE;
    }
    if (action === "tree-nav-down") {
      const next = visible[index + 1];
      return next ? { type: "focus", id: next } : NONE;
    }
    if (action === "tree-nav-up") {
      const prev = index > 0 ? visible[index - 1] : undefined;
      return prev ? { type: "focus", id: prev } : NONE;
    }
    if (action === "tree-nav-first") {
      const first = visible[0];
      return first ? { type: "focus", id: first } : NONE;
    }
    if (action === "tree-nav-last") {
      const last = visible[visible.length - 1];
      return last ? { type: "focus", id: last } : NONE;
    }
    if (action === "tree-activate") {
      return isFolder(node)
        ? { type: "toggle", id: focusedId }
        : { type: "activate", id: focusedId };
    }
    if (action === "tree-expand") {
      if (!isFolder(node)) return NONE;
      if (!expandedIds.has(focusedId)) return { type: "expand", id: focusedId };
      const firstChild = node.children[0];
      return firstChild ? { type: "focus", id: deps.nodeId(firstChild) } : NONE;
    }
    if (action === "tree-collapse") {
      if (isFolder(node) && expandedIds.has(focusedId))
        return { type: "collapse", id: focusedId };
      const parentId = deps.locateNode(tree, focusedId)?.parentId ?? null;
      return parentId ? { type: "focus", id: parentId } : NONE;
    }
    return NONE;
  };

  const resolveTreeKey = (input: {
    tree: Node[];
    expandedIds: Set<string>;
    focusedId: string;
    event: KeyboardEvent;
    bindings: TreeBindings;
  }): TreeKeyCommand => {
    const { tree, expandedIds, focusedId, event, bindings } = input;
    const node = deps.findNode(tree, focusedId);
    if (!node) return NONE;
    const action = TREE_ACTION_ORDER.find((id) => {
      const actionBindings = bindings[id];
      return (
        Array.isArray(actionBindings) &&
        actionBindings.some((binding) =>
          matchesKeyboardEvent(event, binding as Hotkey),
        )
      );
    });
    if (!action) return NONE;
    return commandFor(action, tree, expandedIds, focusedId, node);
  };

  return {
    expandedFolderIds,
    flattenSelectable,
    treeMoveTarget,
    resolveTreeKey,
  };
};
