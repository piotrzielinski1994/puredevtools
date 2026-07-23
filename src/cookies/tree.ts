import { createTreeOps, type MoveTarget } from "../shared/tree";
import type {
  CookieFolderNode,
  CookieMapping,
  CookieMappingNode,
  CookieTreeNode,
} from "./model";

export type { MoveTarget } from "../shared/tree";

const copyMapping = (
  mapping: CookieMapping,
  id: string,
  name: string,
): CookieMapping => ({
  ...mapping,
  id,
  name,
  cookieNames: [...mapping.cookieNames],
});

const ops = createTreeOps<CookieMappingNode, CookieMapping>({
  leafId: (leaf) => leaf.mapping.id,
  payloadId: (mapping) => mapping.id,
  toLeaf: (mapping) => ({ kind: "mapping", mapping }),
  fromLeaf: (leaf) => leaf.mapping,
  cloneLeaf: (leaf, newId, renameTop) => ({
    kind: "mapping",
    mapping: copyMapping(
      leaf.mapping,
      newId,
      renameTop ? `${leaf.mapping.name} (copy)` : leaf.mapping.name,
    ),
  }),
});

export const nodeId = (node: CookieTreeNode): string => ops.nodeId(node);
export const flatten = (tree: CookieTreeNode[]): CookieMapping[] =>
  ops.flatten(tree);
export const findNode = (
  tree: CookieTreeNode[],
  id: string,
): CookieTreeNode | undefined => ops.findNode(tree, id);
export const removeNode = (
  tree: CookieTreeNode[],
  id: string,
): { tree: CookieTreeNode[]; node?: CookieTreeNode } =>
  ops.removeNode(tree, id);
export const insertNode = (
  tree: CookieTreeNode[],
  toInsert: CookieTreeNode,
  target: MoveTarget,
): CookieTreeNode[] => ops.insertNode(tree, toInsert, target);
export const moveNode = (
  tree: CookieTreeNode[],
  dragId: string,
  target: MoveTarget,
): CookieTreeNode[] => ops.moveNode(tree, dragId, target);
export const renameFolder = (
  tree: CookieTreeNode[],
  id: string,
  name: string,
): CookieTreeNode[] => ops.renameFolder(tree, id, name);
export const toggleCollapse = (
  tree: CookieTreeNode[],
  id: string,
): CookieTreeNode[] => ops.toggleCollapse(tree, id);
export const walkMappingIds = (tree: CookieTreeNode[]): string[] =>
  ops.walkLeafIds(tree);
export const updateMappingInTree = (
  tree: CookieTreeNode[],
  mapping: CookieMapping,
): CookieTreeNode[] => ops.updateLeafInTree(tree, mapping);
export const collectFolderIds = (tree: CookieTreeNode[]): Set<string> =>
  ops.collectFolderIds(tree);
export const newFolderId = (tree: CookieTreeNode[]): string =>
  ops.newFolderId(tree);
export const addFolderNode = (
  tree: CookieTreeNode[],
  parentId: string | null,
  id: string,
): CookieTreeNode[] => ops.addFolderNode(tree, parentId, id);
export const duplicateNode = (
  tree: CookieTreeNode[],
  id: string,
): CookieTreeNode[] => ops.duplicateNode(tree, id);

export const mappingNode = (mapping: CookieMapping): CookieMappingNode => ({
  kind: "mapping",
  mapping,
});

export const migrateLegacy = (mappings: CookieMapping[]): CookieTreeNode[] =>
  mappings.map(mappingNode);

export const isFolder = (node: CookieTreeNode): node is CookieFolderNode =>
  node.kind === "folder";
