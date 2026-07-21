import type { ReactNode } from 'react';
import type { MoveTarget, TreeFolder } from '../../shared/tree';
import type { ContextMenuItem } from './ContextMenu';

export type SidebarLeaf = { kind: string };
export type SidebarNode<Leaf extends SidebarLeaf> = Leaf | TreeFolder<Leaf>;

export const isFolderNode = <Leaf extends SidebarLeaf>(
  node: SidebarNode<Leaf>,
): node is TreeFolder<Leaf> => node.kind === 'folder';

export type TreeAdapter<Leaf extends SidebarLeaf> = {
  workspace: Array<SidebarNode<Leaf>>;
  nodeId(node: SidebarNode<Leaf>): string;
  isFiltering: boolean;
  renderFiltered(): ReactNode;
  renderLeaf(node: Leaf, depth: number): ReactNode;
  leafLabel(node: Leaf): string;
  leafMenuItems(node: Leaf): ContextMenuItem[];
  onActivateLeaf(id: string): void;
  duplicateLeaf(id: string): void | Promise<void>;
  onNewLeaf(): void;
  newLeafLabel: string;
  treeLabel: string;
  emptyTitle: string;
  emptyHint: string;
  moveNode(dragId: string, target: MoveTarget): void | Promise<void>;
  addFolder(parentId: string | null): Promise<string>;
  renameFolder(id: string, name: string): void | Promise<void>;
  removeNode(id: string): void | Promise<void>;
  duplicateFolder(id: string): void | Promise<void>;
  toggleCollapse(id: string): void | Promise<void>;
  confirmRemoveLabel(node: SidebarNode<Leaf>): string;
};
