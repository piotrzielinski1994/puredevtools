import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Copy, FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dropTargetBy,
  findNodeBy,
  locateNodeBy,
  parseEmptyZoneId,
  projectDropPosition,
  ROOT_ZONE_ID,
} from "../../shared/tree";
import { createTreeKeyboard } from "../../shared/tree-keyboard";
import { resolveShortcuts } from "../../shortcuts/resolve";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { useShortcutOverrides } from "./shortcutsContext";
import { TreeRow, TreeUiProvider } from "./TreeRow";
import { type DropIndicator, TreeDndProvider } from "./tree-dnd";
import { TreeNavProvider } from "./tree-nav";
import {
  isFolderNode,
  type SidebarLeaf,
  type SidebarNode,
  type TreeAdapter,
} from "./treeAdapter";
import { useActionHotkeys } from "./useActionHotkeys";

const SPRING_LOAD_MS = 600;

type MenuState<Leaf extends SidebarLeaf> = {
  node: SidebarNode<Leaf> | null;
  x: number;
  y: number;
};

const RootDropZone = ({
  isDragActive,
  isOver,
}: {
  isDragActive: boolean;
  isOver: boolean;
}) => {
  const { setNodeRef } = useDroppable({ id: ROOT_ZONE_ID });
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      data-testid="root-drop-zone"
      className={`min-h-16 ${isDragActive && isOver ? "bg-accent/40" : ""}`}
    />
  );
};

const pointerY = (event: DragOverEvent): number | null => {
  const activator = event.activatorEvent;
  if (activator instanceof MouseEvent) return activator.clientY + event.delta.y;
  const rect = event.active.rect.current.translated;
  return rect ? rect.top + rect.height / 2 : null;
};

export const TreeSidebar = <Leaf extends SidebarLeaf>({
  adapter,
}: {
  adapter: TreeAdapter<Leaf>;
}) => {
  const {
    workspace,
    nodeId,
    isFiltering,
    renderFiltered,
    renderLeaf,
    leafMenuItems,
    onActivateLeaf,
    onNewLeaf,
    newLeafLabel,
    emptyTitle,
    emptyHint,
    moveNode,
    addFolder,
    renameFolder,
    removeNode,
    duplicateFolder,
    toggleCollapse,
    confirmRemoveLabel,
  } = adapter;

  const bindings = resolveShortcuts(useShortcutOverrides());
  const findNode = (tree: Array<SidebarNode<Leaf>>, id: string) =>
    findNodeBy(tree, id, nodeId);
  const locateNode = (tree: Array<SidebarNode<Leaf>>, id: string) =>
    locateNodeBy(tree, id, nodeId);
  const kb = useRef(
    createTreeKeyboard<Leaf>({ nodeId, findNode, locateNode }),
  ).current;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [menu, setMenu] = useState<MenuState<Leaf> | undefined>(undefined);
  const [renamingId, setRenamingId] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const springLoad = useRef<{ id: string; timer: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const pendingFocusId = useRef<string | null>(null);

  const registerRow = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      rowRefs.current.set(id, el);
      return;
    }
    rowRefs.current.delete(id);
  }, []);

  const expandedIds = kb.expandedFolderIds(workspace);
  const visibleIds = kb.flattenSelectable(workspace, expandedIds);
  const rovingId =
    selectedId !== null && visibleIds.includes(selectedId)
      ? selectedId
      : (visibleIds[0] ?? null);

  const handleKeyDown = useCallback(
    (focusedId: string, event: React.KeyboardEvent) => {
      const command = kb.resolveTreeKey({
        tree: workspace,
        expandedIds: kb.expandedFolderIds(workspace),
        focusedId,
        event: event.nativeEvent,
        bindings,
      });
      if (command.type === "none") return;
      event.preventDefault();
      const run: Record<typeof command.type, () => void> = {
        focus: () => setSelectedId(command.id),
        activate: () => onActivateLeaf(command.id),
        toggle: () => void toggleCollapse(command.id),
        expand: () => void toggleCollapse(command.id),
        collapse: () => void toggleCollapse(command.id),
        move: () =>
          command.type === "move" && void moveNode(command.id, command.target),
      };
      run[command.type]();
      const movesFocus = command.type === "focus" || command.type === "move";
      if (movesFocus) {
        setSelectedId(command.id);
        pendingFocusId.current = command.id;
      }
    },
    [workspace, bindings, onActivateLeaf, toggleCollapse, moveNode, kb],
  );

  useEffect(() => {
    const id = pendingFocusId.current;
    if (id === null) return;
    pendingFocusId.current = null;
    rowRefs.current.get(id)?.focus();
  });

  const clearSpringLoad = () => {
    if (springLoad.current !== null) {
      window.clearTimeout(springLoad.current.timer);
      springLoad.current = null;
    }
  };
  useEffect(() => clearSpringLoad, [clearSpringLoad]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = (event: DragStartEvent) =>
    setActiveId(String(event.active.id));

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || overId === String(event.active.id)) {
      setIndicator(null);
      return;
    }
    if (parseEmptyZoneId(overId) !== null || overId === ROOT_ZONE_ID) {
      clearSpringLoad();
      setIndicator({ overId, position: "inside" });
      return;
    }
    const over = findNode(workspace, overId);
    const isOverFolder = over !== undefined && isFolderNode(over);
    if (over && isFolderNode(over) && over.collapsed) {
      if (springLoad.current?.id !== overId) {
        clearSpringLoad();
        springLoad.current = {
          id: overId,
          timer: window.setTimeout(() => {
            void toggleCollapse(overId);
            springLoad.current = null;
          }, SPRING_LOAD_MS),
        };
      }
    } else {
      clearSpringLoad();
    }
    const overRect = event.over?.rect;
    const y = pointerY(event);
    const position =
      overRect && y !== null
        ? projectDropPosition(
            y,
            { top: overRect.top, height: overRect.height },
            Boolean(isOverFolder),
          )
        : "before";
    setIndicator({ overId, position });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const dragId = String(event.active.id);
    const current = indicator;
    clearSpringLoad();
    setActiveId(null);
    setIndicator(null);
    if (!current || current.overId === dragId) return;
    const target = dropTargetBy(
      workspace,
      dragId,
      current.overId,
      current.position,
      nodeId,
    );
    if (!target) return;
    const from = locateNode(workspace, dragId);
    if (
      from &&
      from.parentId === target.parentId &&
      from.index === target.index
    )
      return;
    void moveNode(dragId, target);
  };

  const openMenu = (node: SidebarNode<Leaf>, x: number, y: number) =>
    setMenu({ node, x, y });
  const openBackgroundMenu = (x: number, y: number) =>
    setMenu({ node: null, x, y });
  const closeMenu = () => setMenu(undefined);

  const confirmRemove = (node: SidebarNode<Leaf>) => {
    if (!window.confirm(`Delete ${confirmRemoveLabel(node)}?`)) return;
    void removeNode(nodeId(node));
  };

  const beginRename = (id: string) => {
    setRenamingId(id);
    closeMenu();
  };

  const createFolder = async (parentId: string | null) => {
    const id = await addFolder(parentId);
    setRenamingId(id);
  };

  useActionHotkeys({
    "new-folder": () => void createFolder(null),
    "duplicate-rule": () => {
      const node = rovingId ? findNode(workspace, rovingId) : undefined;
      if (node && !isFolderNode(node)) void adapter.duplicateLeaf(nodeId(node));
    },
    "rename-node": () => {
      const node = rovingId ? findNode(workspace, rovingId) : undefined;
      if (node && isFolderNode(node)) beginRename(node.id);
    },
  });

  const menuItems = (node: SidebarNode<Leaf> | null): ContextMenuItem[] => {
    if (node === null) {
      return [
        { label: newLeafLabel, icon: FilePlus, onSelect: () => onNewLeaf() },
        {
          label: "New folder",
          icon: FolderPlus,
          onSelect: () => void createFolder(null),
        },
      ];
    }
    if (isFolderNode(node)) {
      return [
        {
          label: "New folder",
          icon: FolderPlus,
          onSelect: () => void createFolder(node.id),
        },
        { label: "Rename", icon: Pencil, onSelect: () => beginRename(node.id) },
        {
          label: "Duplicate",
          icon: Copy,
          onSelect: () => void duplicateFolder(node.id),
        },
        {
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onSelect: () => confirmRemove(node),
        },
      ];
    }
    return leafMenuItems(node);
  };

  const activeNode = activeId ? findNode(workspace, activeId) : undefined;
  const activeLabel = activeNode
    ? isFolderNode(activeNode)
      ? activeNode.name
      : adapter.leafLabel(activeNode)
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        data-testid="sidebar-background"
        className="min-h-0 flex-1 overflow-y-auto"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openBackgroundMenu(event.clientX, event.clientY);
        }}
      >
        {isFiltering ? (
          renderFiltered()
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              clearSpringLoad();
              setActiveId(null);
              setIndicator(null);
            }}
          >
            <TreeDndProvider value={{ activeId, indicator }}>
              <TreeNavProvider
                value={{
                  rovingId,
                  contextMenuBindings: bindings["open-context-menu"],
                  registerRow,
                  handleKeyDown,
                }}
              >
                <TreeUiProvider
                  value={{
                    onActivateLeaf,
                    onContextMenu: openMenu,
                    renamingId,
                    beginRename,
                    commitRename: (id, name) => {
                      setRenamingId(undefined);
                      void renameFolder(id, name);
                    },
                    cancelRename: () => setRenamingId(undefined),
                    draggable: true,
                    toggleCollapse: (id) => void toggleCollapse(id),
                    renderLeaf,
                    nodeId,
                  }}
                >
                  {workspace.length === 0 ? (
                    <div className="m-3 border border-dashed border-border px-3 py-6 text-center">
                      <p className="text-sm font-medium">{emptyTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {emptyHint}
                      </p>
                    </div>
                  ) : (
                    <ul
                      aria-label={adapter.treeLabel}
                      className="flex list-none flex-col p-0"
                    >
                      {workspace.map((node) => (
                        <TreeRow key={nodeId(node)} node={node} depth={0} />
                      ))}
                    </ul>
                  )}
                  {workspace.length > 0 ? (
                    <RootDropZone
                      isDragActive={activeId !== null}
                      isOver={indicator?.overId === ROOT_ZONE_ID}
                    />
                  ) : null}
                </TreeUiProvider>
              </TreeNavProvider>
            </TreeDndProvider>
            <DragOverlay>
              {activeNode ? (
                <div className="bg-accent px-2 py-1 text-sm shadow">
                  {activeLabel}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      {menu ? (
        <ContextMenu
          position={{ x: menu.x, y: menu.y }}
          items={menuItems(menu.node)}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
};
