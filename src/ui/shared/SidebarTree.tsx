import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Copy, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import type { Rule, TreeNode } from '../../rules/model';
import { findNode, nodeId } from '../../rules/tree';
import { Switch } from '../components/ui/switch';
import {
  ROOT_ZONE_ID,
  dropTarget,
  locateNode,
  parseEmptyZoneId,
  projectDropPosition,
} from '../../rules/tree-locate';
import { resolveShortcuts } from '../../shortcuts/resolve';
import { expandedFolderIds, flattenSelectable, resolveTreeKey } from '../../shortcuts/tree-keyboard';
import { useRules } from './RulesProvider';
import { useShortcutOverrides } from './shortcutsContext';
import { TreeNavProvider } from './tree-nav';
import { TreeRow, TreeUiProvider } from './TreeRow';
import { TreeDndProvider, type DropIndicator } from './tree-dnd';

const SPRING_LOAD_MS = 600;

type MenuState = { node: TreeNode | null; x: number; y: number };

type MenuItem = { label: string; icon: typeof Pencil; destructive?: boolean; onSelect(): void };

const ContextMenu = ({ state, items, onClose }: { state: MenuState; items: MenuItem[]; onClose(): void }) => {
  useEffect(() => {
    const dismiss = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('click', dismiss);
    window.addEventListener('contextmenu', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('contextmenu', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-40 border border-border bg-popover py-1 text-sm text-popover-foreground shadow-md"
      style={{ top: state.y, left: state.x }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground ${item.destructive ? 'text-destructive' : ''}`}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </button>
      ))}
    </div>
  );
};

const RootDropZone = ({ isDragActive, isOver }: { isDragActive: boolean; isOver: boolean }) => {
  const { setNodeRef } = useDroppable({ id: ROOT_ZONE_ID });
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      data-testid="root-drop-zone"
      className={`min-h-16 ${isDragActive && isOver ? 'bg-accent/40' : ''}`}
    />
  );
};

const pointerY = (event: DragOverEvent): number | null => {
  const activator = event.activatorEvent;
  if (activator instanceof MouseEvent) return activator.clientY + event.delta.y;
  const rect = event.active.rect.current.translated;
  return rect ? rect.top + rect.height / 2 : null;
};

const matchesFilter = (rule: Rule, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return rule.name.toLowerCase().includes(needle) || rule.matchers.url.pattern.toLowerCase().includes(needle);
};

const FilteredList = ({
  rules,
  filter,
  onEdit,
  onToggle,
}: {
  rules: Rule[];
  filter: string;
  onEdit(ruleId: string): void;
  onToggle(rule: Rule): Promise<void>;
}) => {
  if (rules.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">No rules match “{filter.trim()}”.</p>;
  }
  return (
    <ul className="flex list-none flex-col p-0">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className="flex items-center gap-2 border-b border-b-border px-2 py-1.5 transition-colors last:border-b-0 hover:bg-accent/40"
        >
          <Switch
            aria-label={`Enabled: ${rule.name}`}
            checked={rule.enabled}
            onChange={() => void onToggle({ ...rule, enabled: !rule.enabled })}
          />
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer text-left"
            aria-label={`Edit: ${rule.name}`}
            onClick={() => onEdit(rule.id)}
          >
            <p className={`truncate text-sm font-medium ${rule.enabled ? '' : 'text-muted-foreground line-through'}`}>
              {rule.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{rule.matchers.url.pattern || '(any URL)'}</span>
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
};

export const SidebarTree = ({ onEdit, filter = '' }: { onEdit(ruleId: string): void; filter?: string }) => {
  const { workspace, rules, updateRule, moveNode, addFolder, renameFolder, removeNode, duplicateRule, toggleCollapse } =
    useRules();
  const bindings = resolveShortcuts(useShortcutOverrides());
  const isFiltering = filter.trim() !== '';
  const filtered = rules.filter((rule) => matchesFilter(rule, filter));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [menu, setMenu] = useState<MenuState | undefined>(undefined);
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

  const expandedIds = expandedFolderIds(workspace);
  const visibleIds = flattenSelectable(workspace, expandedIds);
  const rovingId =
    selectedId !== null && visibleIds.includes(selectedId) ? selectedId : (visibleIds[0] ?? null);

  const handleKeyDown = useCallback(
    (focusedId: string, event: React.KeyboardEvent) => {
      const command = resolveTreeKey({
        tree: workspace,
        expandedIds: expandedFolderIds(workspace),
        focusedId,
        event: event.nativeEvent,
        bindings,
      });
      if (command.type === 'none') return;
      event.preventDefault();
      const run: Record<typeof command.type, () => void> = {
        focus: () => setSelectedId(command.id),
        activate: () => onEdit(command.id),
        toggle: () => void toggleCollapse(command.id),
        expand: () => void toggleCollapse(command.id),
        collapse: () => void toggleCollapse(command.id),
        move: () => command.type === 'move' && void moveNode(command.id, command.target),
      };
      run[command.type]();
      const movesFocus = command.type === 'focus' || command.type === 'move';
      if (movesFocus) {
        setSelectedId(command.id);
        pendingFocusId.current = command.id;
      }
    },
    [workspace, bindings, onEdit, toggleCollapse, moveNode],
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
  useEffect(() => clearSpringLoad, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || overId === String(event.active.id)) {
      setIndicator(null);
      return;
    }
    if (parseEmptyZoneId(overId) !== null || overId === ROOT_ZONE_ID) {
      clearSpringLoad();
      setIndicator({ overId, position: 'inside' });
      return;
    }
    const over = findNode(workspace, overId);
    const isOverFolder = over?.kind === 'folder';
    if (isOverFolder && over.kind === 'folder' && over.collapsed) {
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
        ? projectDropPosition(y, { top: overRect.top, height: overRect.height }, Boolean(isOverFolder))
        : 'before';
    setIndicator({ overId, position });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const dragId = String(event.active.id);
    const current = indicator;
    clearSpringLoad();
    setActiveId(null);
    setIndicator(null);
    if (!current || current.overId === dragId) return;
    const target = dropTarget(workspace, dragId, current.overId, current.position);
    if (!target) return;
    const from = locateNode(workspace, dragId);
    if (from && from.parentId === target.parentId && from.index === target.index) return;
    void moveNode(dragId, target);
  };

  const openMenu = (node: TreeNode, x: number, y: number) => setMenu({ node, x, y });
  const closeMenu = () => setMenu(undefined);

  const confirmRemove = (node: TreeNode) => {
    const label = node.kind === 'folder' ? `folder "${node.name}" and everything in it` : `rule "${node.rule.name}"`;
    if (!window.confirm(`Delete ${label}?`)) return;
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

  const menuItems = (node: TreeNode): MenuItem[] => {
    if (node.kind === 'folder') {
      return [
        { label: 'New folder', icon: FolderPlus, onSelect: () => void createFolder(node.id) },
        { label: 'Rename', icon: Pencil, onSelect: () => beginRename(node.id) },
        { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => confirmRemove(node) },
      ];
    }
    return [
      { label: 'Edit', icon: Pencil, onSelect: () => onEdit(node.rule.id) },
      { label: 'Duplicate', icon: Copy, onSelect: () => void duplicateRule(node.rule) },
      { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => confirmRemove(node) },
    ];
  };

  const activeNode = activeId ? findNode(workspace, activeId) : undefined;
  const activeLabel = activeNode ? (activeNode.kind === 'folder' ? activeNode.name : activeNode.rule.name) : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-stretch border-b">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 border-r border-r-border px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => void createFolder(null)}
        >
          <FolderPlus className="size-4" />
          New folder
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isFiltering ? (
          <FilteredList rules={filtered} filter={filter} onEdit={onEdit} onToggle={updateRule} />
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
                value={{ rovingId, contextMenuBindings: bindings['open-context-menu'], registerRow, handleKeyDown }}
              >
                <TreeUiProvider
                  value={{
                    onEdit,
                    onContextMenu: openMenu,
                    renamingId,
                    beginRename,
                    commitRename: (id, name) => {
                      setRenamingId(undefined);
                      void renameFolder(id, name);
                    },
                    cancelRename: () => setRenamingId(undefined),
                    draggable: true,
                  }}
                >
                  {workspace.length === 0 ? (
                    <div className="m-3 border border-dashed border-border px-3 py-6 text-center">
                      <p className="text-sm font-medium">No rules yet.</p>
                      <p className="mt-1 text-xs text-muted-foreground">Add a rule or a folder to start.</p>
                    </div>
                  ) : (
                    <ul role="tree" aria-label="Rules" className="flex list-none flex-col p-0">
                      {workspace.map((node) => (
                        <TreeRow key={nodeId(node)} node={node} depth={0} />
                      ))}
                    </ul>
                  )}
                  {workspace.length > 0 ? (
                    <RootDropZone isDragActive={activeId !== null} isOver={indicator?.overId === ROOT_ZONE_ID} />
                  ) : null}
                </TreeUiProvider>
              </TreeNavProvider>
            </TreeDndProvider>
            <DragOverlay>
              {activeNode ? <div className="bg-accent px-2 py-1 text-sm shadow">{activeLabel}</div> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      {menu?.node ? <ContextMenu state={menu} items={menuItems(menu.node)} onClose={closeMenu} /> : null}
    </div>
  );
};
