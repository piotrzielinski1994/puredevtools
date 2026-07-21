import type { RuleNode, TreeNode } from '../rules/model';
import { findNode, nodeId } from '../rules/tree';
import { locateNode } from '../rules/tree-locate';
import { createTreeKeyboard, type TreeMoveDirection } from '../shared/tree-keyboard';
import type { MoveTarget } from '../shared/tree';
import type { ShortcutActionId } from './registry';

export type { TreeKeyCommand, TreeMoveDirection } from '../shared/tree-keyboard';

export type TreeBindings = Partial<Record<ShortcutActionId, string[]>>;

const kb = createTreeKeyboard<RuleNode>({ nodeId, findNode, locateNode });

export const expandedFolderIds = (tree: TreeNode[]): Set<string> => kb.expandedFolderIds(tree);

export const flattenSelectable = (tree: TreeNode[], expandedIds: Set<string>): string[] =>
  kb.flattenSelectable(tree, expandedIds);

export const treeMoveTarget = (tree: TreeNode[], id: string, direction: TreeMoveDirection): MoveTarget | null =>
  kb.treeMoveTarget(tree, id, direction);

export const resolveTreeKey = (input: {
  tree: TreeNode[];
  expandedIds: Set<string>;
  focusedId: string;
  event: KeyboardEvent;
  bindings: TreeBindings;
}) => kb.resolveTreeKey(input);
