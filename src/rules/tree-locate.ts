import type { TreeNode } from './model';
import { treeOps } from './tree';
import {
  emptyZoneId,
  parseEmptyZoneId,
  projectDropPosition,
  ROOT_ZONE_ID,
  type DropPosition,
  type MoveTarget,
  type NodeLocation,
} from '../shared/tree';

export { emptyZoneId, parseEmptyZoneId, projectDropPosition, ROOT_ZONE_ID };
export type { DropPosition, NodeLocation };

export const locateNode = (tree: TreeNode[], id: string, parentId: string | null = null): NodeLocation | null =>
  treeOps.locateNode(tree, id, parentId);

export const dropTarget = (
  tree: TreeNode[],
  dragId: string,
  overId: string,
  position: DropPosition,
): MoveTarget | null => treeOps.dropTarget(tree, dragId, overId, position);
