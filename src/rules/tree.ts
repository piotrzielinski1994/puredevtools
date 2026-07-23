import { createTreeOps, type MoveTarget } from "../shared/tree";
import { copyRule } from "./clone";
import type { Rule, RuleNode, TreeNode } from "./model";

export type { MoveTarget } from "../shared/tree";

export const treeOps = createTreeOps<RuleNode, Rule>({
  leafId: (leaf) => leaf.rule.id,
  payloadId: (rule) => rule.id,
  toLeaf: (rule) => ({ kind: "rule", rule }),
  fromLeaf: (leaf) => leaf.rule,
  cloneLeaf: (leaf, newId, renameTop) => ({
    kind: "rule",
    rule: copyRule(
      leaf.rule,
      newId,
      renameTop ? `${leaf.rule.name} (copy)` : leaf.rule.name,
    ),
  }),
});

const ops = treeOps;

export const nodeId = (node: TreeNode): string => ops.nodeId(node);
export const flatten = (tree: TreeNode[]): Rule[] => ops.flatten(tree);
export const findNode = (tree: TreeNode[], id: string): TreeNode | undefined =>
  ops.findNode(tree, id);
export const containsId = (node: TreeNode, id: string): boolean =>
  ops.containsId(node, id);
export const removeNode = (
  tree: TreeNode[],
  id: string,
): { tree: TreeNode[]; node?: TreeNode } => ops.removeNode(tree, id);
export const insertNode = (
  tree: TreeNode[],
  toInsert: TreeNode,
  target: MoveTarget,
): TreeNode[] => ops.insertNode(tree, toInsert, target);
export const moveNode = (
  tree: TreeNode[],
  dragId: string,
  target: MoveTarget,
): TreeNode[] => ops.moveNode(tree, dragId, target);
export const renameFolder = (
  tree: TreeNode[],
  id: string,
  name: string,
): TreeNode[] => ops.renameFolder(tree, id, name);
export const toggleCollapse = (tree: TreeNode[], id: string): TreeNode[] =>
  ops.toggleCollapse(tree, id);
export const walkRuleIds = (tree: TreeNode[]): string[] =>
  ops.walkLeafIds(tree);
export const updateRuleInTree = (tree: TreeNode[], rule: Rule): TreeNode[] =>
  ops.updateLeafInTree(tree, rule);
export const collectFolderIds = (tree: TreeNode[]): Set<string> =>
  ops.collectFolderIds(tree);
export const newFolderId = (tree: TreeNode[]): string => ops.newFolderId(tree);
export const addFolderNode = (
  tree: TreeNode[],
  parentId: string | null,
  id: string,
): TreeNode[] => ops.addFolderNode(tree, parentId, id);
export const duplicateNode = (tree: TreeNode[], id: string): TreeNode[] =>
  ops.duplicateNode(tree, id);
