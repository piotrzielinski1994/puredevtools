import {
  type DropPosition,
  emptyZoneId,
  type MoveTarget,
  type NodeLocation,
  parseEmptyZoneId,
  projectDropPosition,
  ROOT_ZONE_ID,
} from "../shared/tree";
import type { TreeNode } from "./model";
import { treeOps } from "./tree";

export type { DropPosition, NodeLocation };
export { emptyZoneId, parseEmptyZoneId, projectDropPosition, ROOT_ZONE_ID };

export const locateNode = (
  tree: TreeNode[],
  id: string,
  parentId: string | null = null,
): NodeLocation | null => treeOps.locateNode(tree, id, parentId);

export const dropTarget = (
  tree: TreeNode[],
  dragId: string,
  overId: string,
  position: DropPosition,
): MoveTarget | null => treeOps.dropTarget(tree, dragId, overId, position);
