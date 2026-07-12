import type { TreeNode } from './model';
import { nodeId } from './tree';

const uniqueId = (id: string, taken: Set<string>): string => {
  if (!taken.has(id)) {
    taken.add(id);
    return id;
  }
  const base = `${id}-imported`;
  let suffix = 1;
  let candidate = base;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  taken.add(candidate);
  return candidate;
};

const reId = (node: TreeNode, taken: Set<string>): TreeNode => {
  if (node.kind === 'rule') {
    return { kind: 'rule', rule: { ...node.rule, id: uniqueId(node.rule.id, taken) } };
  }
  return {
    ...node,
    id: uniqueId(node.id, taken),
    children: node.children.map((child) => reId(child, taken)),
  };
};

export const mergeRules = (current: TreeNode[], imported: TreeNode[]): TreeNode[] => {
  const taken = new Set<string>();
  const collect = (nodes: TreeNode[]): void =>
    nodes.forEach((node) => {
      taken.add(nodeId(node));
      if (node.kind === 'folder') collect(node.children);
    });
  collect(current);
  const appended = imported.map((node) => reId(node, taken));
  return [...current, ...appended];
};
