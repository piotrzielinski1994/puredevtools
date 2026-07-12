import type { FolderNode, Rule, TreeNode } from './model';

export type MoveTarget = { parentId: string | null; index: number };

export const nodeId = (node: TreeNode): string => (node.kind === 'rule' ? node.rule.id : node.id);

export const flatten = (tree: TreeNode[]): Rule[] =>
  tree.flatMap((node) => (node.kind === 'rule' ? [node.rule] : flatten(node.children)));

export const findNode = (tree: TreeNode[], id: string): TreeNode | undefined => {
  const direct = tree.find((node) => nodeId(node) === id);
  if (direct) return direct;
  return tree
    .filter((node): node is FolderNode => node.kind === 'folder')
    .map((folder) => findNode(folder.children, id))
    .find((found): found is TreeNode => found !== undefined);
};

export const containsId = (node: TreeNode, id: string): boolean => {
  if (nodeId(node) === id) return true;
  if (node.kind !== 'folder') return false;
  return node.children.some((child) => containsId(child, id));
};

export const removeNode = (tree: TreeNode[], id: string): { tree: TreeNode[]; node?: TreeNode } => {
  const removed = findNode(tree, id);
  const without = tree.flatMap<TreeNode>((node) => {
    if (nodeId(node) === id) return [];
    if (node.kind === 'folder') return [{ ...node, children: removeNode(node.children, id).tree }];
    return [node];
  });
  return { tree: without, node: removed };
};

export const insertNode = (tree: TreeNode[], toInsert: TreeNode, target: MoveTarget): TreeNode[] => {
  if (target.parentId === null) {
    const at = Math.max(0, Math.min(target.index, tree.length));
    return [...tree.slice(0, at), toInsert, ...tree.slice(at)];
  }
  return tree.map((node) => {
    if (node.kind !== 'folder') return node;
    if (node.id === target.parentId) {
      const at = Math.max(0, Math.min(target.index, node.children.length));
      return { ...node, children: [...node.children.slice(0, at), toInsert, ...node.children.slice(at)] };
    }
    return { ...node, children: insertNode(node.children, toInsert, target) };
  });
};

export const moveNode = (tree: TreeNode[], dragId: string, target: MoveTarget): TreeNode[] => {
  const dragged = findNode(tree, dragId);
  if (!dragged) return tree;
  if (target.parentId !== null) {
    const parent = findNode(tree, target.parentId);
    if (!parent || parent.kind !== 'folder') return tree;
    if (containsId(dragged, target.parentId)) return tree;
  }
  const without = removeNode(tree, dragId).tree;
  return insertNode(without, dragged, target);
};

export const renameFolder = (tree: TreeNode[], id: string, name: string): TreeNode[] => {
  if (name.trim() === '') return tree;
  return tree.map((node) => {
    if (node.kind !== 'folder') return node;
    if (node.id === id) return { ...node, name };
    return { ...node, children: renameFolder(node.children, id, name) };
  });
};

export const toggleCollapse = (tree: TreeNode[], id: string): TreeNode[] =>
  tree.map((node) => {
    if (node.kind !== 'folder') return node;
    if (node.id === id) return { ...node, collapsed: !node.collapsed };
    return { ...node, children: toggleCollapse(node.children, id) };
  });

export const walkRuleIds = (tree: TreeNode[]): string[] =>
  tree.flatMap((node) => (node.kind === 'rule' ? [node.rule.id] : walkRuleIds(node.children)));

export const updateRuleInTree = (tree: TreeNode[], rule: Rule): TreeNode[] =>
  tree.map((node) => {
    if (node.kind === 'rule') return node.rule.id === rule.id ? { kind: 'rule', rule } : node;
    return { ...node, children: updateRuleInTree(node.children, rule) };
  });

const collectFolderIds = (tree: TreeNode[]): Set<string> => {
  const ids = new Set<string>();
  const walk = (nodes: TreeNode[]): void =>
    nodes.forEach((node) => {
      if (node.kind !== 'folder') return;
      ids.add(node.id);
      walk(node.children);
    });
  walk(tree);
  return ids;
};

export const newFolderId = (tree: TreeNode[]): string => {
  const taken = collectFolderIds(tree);
  const next = (n: number): string => {
    const candidate = `folder-${n}`;
    return taken.has(candidate) ? next(n + 1) : candidate;
  };
  return next(taken.size + 1);
};

export const addFolderNode = (tree: TreeNode[], parentId: string | null, id: string): TreeNode[] => {
  const folder: FolderNode = { kind: 'folder', id, name: 'New folder', collapsed: false, children: [] };
  if (parentId === null) return [...tree, folder];
  return insertNode(tree, folder, { parentId, index: Number.MAX_SAFE_INTEGER });
};
