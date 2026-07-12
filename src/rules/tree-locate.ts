import type { TreeNode } from './model';
import { findNode, nodeId, type MoveTarget } from './tree';

export type DropPosition = 'before' | 'after' | 'inside';

export type NodeLocation = { parentId: string | null; index: number };

const EMPTY_ZONE_PREFIX = 'empty-zone:';

export const emptyZoneId = (folderId: string): string => `${EMPTY_ZONE_PREFIX}${folderId}`;

export const parseEmptyZoneId = (id: string): string | null =>
  id.startsWith(EMPTY_ZONE_PREFIX) ? id.slice(EMPTY_ZONE_PREFIX.length) : null;

export const ROOT_ZONE_ID = 'root-zone';

export const locateNode = (
  tree: TreeNode[],
  id: string,
  parentId: string | null = null,
): NodeLocation | null => {
  const index = tree.findIndex((node) => nodeId(node) === id);
  if (index !== -1) return { parentId, index };
  const nested = tree
    .filter((node) => node.kind === 'folder')
    .map((folder) => (folder.kind === 'folder' ? locateNode(folder.children, id, folder.id) : null))
    .find((location): location is NodeLocation => location !== null);
  return nested ?? null;
};

export const projectDropPosition = (
  pointerY: number,
  rect: { top: number; height: number },
  isFolder: boolean,
): DropPosition => {
  if (rect.height <= 0) return 'before';
  const fraction = (pointerY - rect.top) / rect.height;
  if (!isFolder) return fraction < 0.5 ? 'before' : 'after';
  if (fraction < 0.25) return 'before';
  if (fraction > 0.75) return 'after';
  return 'inside';
};

export const rawDropTarget = (
  tree: TreeNode[],
  overId: string,
  position: DropPosition,
): MoveTarget | null => {
  if (overId === ROOT_ZONE_ID) return { parentId: null, index: tree.length };
  const emptyZoneFolderId = parseEmptyZoneId(overId);
  if (emptyZoneFolderId !== null) {
    const folder = findNode(tree, emptyZoneFolderId);
    if (!folder || folder.kind !== 'folder') return null;
    return { parentId: emptyZoneFolderId, index: folder.children.length };
  }
  if (position === 'inside') {
    const over = findNode(tree, overId);
    if (!over || over.kind !== 'folder') return null;
    return { parentId: overId, index: over.children.length };
  }
  const location = locateNode(tree, overId);
  if (!location) return null;
  const index = position === 'before' ? location.index : location.index + 1;
  return { parentId: location.parentId, index };
};

export const dropTarget = (
  tree: TreeNode[],
  dragId: string,
  overId: string,
  position: DropPosition,
): MoveTarget | null => {
  const raw = rawDropTarget(tree, overId, position);
  if (!raw || position === 'inside' || parseEmptyZoneId(overId) !== null) return raw;
  const dragLocation = locateNode(tree, dragId);
  const isSameParent = dragLocation !== null && dragLocation.parentId === raw.parentId;
  const index = isSameParent && dragLocation.index < raw.index ? raw.index - 1 : raw.index;
  return { parentId: raw.parentId, index };
};
