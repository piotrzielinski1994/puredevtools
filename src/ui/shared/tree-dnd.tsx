import { createContext, useContext } from "react";
import type { DropPosition } from "../../rules/tree-locate";

export type DropIndicator = { overId: string; position: DropPosition };

export type TreeDndState = {
  activeId: string | null;
  indicator: DropIndicator | null;
};

const TreeDndContext = createContext<TreeDndState>({
  activeId: null,
  indicator: null,
});

export const TreeDndProvider = TreeDndContext.Provider;

export const useTreeDnd = (): TreeDndState => useContext(TreeDndContext);
