import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { emptyZoneId, type TreeFolder } from '../../shared/tree';
import { isFolderNode, type SidebarLeaf, type SidebarNode } from './treeAdapter';
import { cn } from '../lib/utils';
import { useTreeDnd } from './tree-dnd';
import { openContextMenuOnKey, useTreeNav } from './tree-nav';

type AnyNode = SidebarNode<SidebarLeaf>;

export const useRowNav = (id: string) => {
  const { rovingId, contextMenuBindings, registerRow, handleKeyDown } = useTreeNav();
  return {
    tabIndex: rovingId === id ? 0 : -1,
    ref: (el: HTMLElement | null) => registerRow(id, el),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (openContextMenuOnKey(event, contextMenuBindings)) return;
      handleKeyDown(id, event);
    },
  };
};

export type TreeUiContextValue = {
  onActivateLeaf(id: string): void;
  onContextMenu(node: AnyNode, x: number, y: number): void;
  renamingId: string | undefined;
  beginRename(id: string): void;
  commitRename(id: string, name: string): void;
  cancelRename(): void;
  draggable: boolean;
  toggleCollapse(id: string): void;
  renderLeaf(node: SidebarLeaf, depth: number): ReactNode;
  nodeId(node: AnyNode): string;
};

const TreeUiContext = createContext<TreeUiContextValue | undefined>(undefined);

export const TreeUiProvider = TreeUiContext.Provider;

export const useTreeUi = (): TreeUiContextValue => {
  const value = useContext(TreeUiContext);
  if (!value) throw new Error('TreeRow must be used within a TreeUiProvider');
  return value;
};

export const useRowDnd = (id: string, enabled: boolean) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id, disabled: !enabled });
  const { setNodeRef: setDropRef } = useDroppable({ id, disabled: !enabled });
  const { indicator } = useTreeDnd();
  const setNodeRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  return {
    attributes: enabled ? attributes : {},
    listeners: enabled ? listeners : {},
    setNodeRef,
    isDragging,
    dropBefore: indicator?.overId === id && indicator.position === 'before',
    dropAfter: indicator?.overId === id && indicator.position === 'after',
    dropInside: indicator?.overId === id && indicator.position === 'inside',
  };
};

export const DropLine = () => (
  <div aria-hidden="true" data-testid="drop-line" className="pointer-events-none h-0.5 bg-primary" />
);

export const LeafRow = ({
  node,
  id,
  ariaLabel,
  depth,
  children,
}: {
  node: AnyNode;
  id: string;
  ariaLabel: string;
  depth: number;
  children: ReactNode;
}) => {
  const { onContextMenu, draggable } = useTreeUi();
  const { attributes, listeners, setNodeRef, isDragging, dropBefore, dropAfter } = useRowDnd(id, draggable);
  const nav = useRowNav(id);

  return (
    <li className="relative">
      {dropBefore ? <DropLine /> : null}
      <div
        ref={(el) => {
          setNodeRef(el);
          nav.ref(el);
        }}
        {...attributes}
        {...listeners}
        role="treeitem"
        tabIndex={nav.tabIndex}
        aria-label={ariaLabel}
        onKeyDown={nav.onKeyDown}
        onContextMenu={
          draggable
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(node, event.clientX, event.clientY);
              }
            : undefined
        }
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={cn(
          'group flex touch-none items-center gap-2 border-b border-b-border py-1.5 pr-2 transition-colors last:border-b-0 hover:bg-accent/40',
          isDragging && 'opacity-50',
        )}
      >
        {children}
      </div>
      {dropAfter ? <DropLine /> : null}
    </li>
  );
};

const RenameInput = ({ id, name }: { id: string; name: string }) => {
  const { commitRename, cancelRename } = useTreeUi();
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) {
      commitRename(id, value);
      return;
    }
    cancelRename();
  };

  return (
    <input
      ref={inputRef}
      aria-label="Rename folder"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="min-w-0 flex-1 border border-input bg-background px-1 text-sm outline-none focus:border-primary"
    />
  );
};

const EmptyDropZone = ({ folderId, depth }: { folderId: string; depth: number }) => {
  const zoneId = emptyZoneId(folderId);
  const { setNodeRef } = useDroppable({ id: zoneId });
  const { indicator } = useTreeDnd();
  const isOver = indicator?.overId === zoneId;
  return (
    <li>
      <div
        ref={setNodeRef}
        aria-hidden="true"
        data-testid="empty-drop-zone"
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        className={cn('py-1 pr-2 text-xs italic text-muted-foreground', isOver && 'ring-1 ring-inset ring-primary')}
      >
        Drop here
      </div>
    </li>
  );
};

const FolderRow = ({ node, depth }: { node: TreeFolder<SidebarLeaf>; depth: number }) => {
  const { onContextMenu, renamingId, beginRename, draggable, toggleCollapse, nodeId } = useTreeUi();
  const { activeId } = useTreeDnd();
  const { attributes, listeners, setNodeRef, isDragging, dropBefore, dropAfter, dropInside } = useRowDnd(
    node.id,
    draggable,
  );
  const nav = useRowNav(node.id);
  const Chevron = node.collapsed ? ChevronRight : ChevronDown;
  const isEmpty = node.children.length === 0;
  const isDragActive = activeId !== null && activeId !== node.id;
  const isRenaming = renamingId === node.id;

  return (
    <li className="relative">
      {dropBefore ? <DropLine /> : null}
      <div
        ref={(el) => {
          setNodeRef(el);
          nav.ref(el);
        }}
        {...attributes}
        {...listeners}
        role="treeitem"
        tabIndex={nav.tabIndex}
        aria-expanded={!node.collapsed}
        aria-label={`Folder: ${node.name}`}
        onKeyDown={nav.onKeyDown}
        onContextMenu={
          draggable
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(node, event.clientX, event.clientY);
              }
            : undefined
        }
        onClick={() => toggleCollapse(node.id)}
        onDoubleClick={draggable ? () => beginRename(node.id) : undefined}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={cn(
          'group flex cursor-pointer touch-none items-center gap-1 border-b border-b-border py-1.5 pr-2 text-sm font-medium transition-colors hover:bg-accent/40',
          isDragging && 'opacity-50',
          dropInside && 'ring-1 ring-inset ring-primary',
        )}
      >
        <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
        {isRenaming ? <RenameInput id={node.id} name={node.name} /> : <span className="truncate">{node.name}</span>}
      </div>
      {dropAfter ? <DropLine /> : null}
      {node.collapsed ? null : (
        <ul className="flex list-none flex-col p-0">
          {node.children.map((child) => (
            <TreeRow key={nodeId(child)} node={child} depth={depth + 1} />
          ))}
          {isEmpty && isDragActive ? <EmptyDropZone folderId={node.id} depth={depth + 1} /> : null}
        </ul>
      )}
    </li>
  );
};

export const TreeRow = ({ node, depth }: { node: AnyNode; depth: number }) => {
  const { renderLeaf } = useTreeUi();
  if (isFolderNode(node)) return <FolderRow node={node} depth={depth} />;
  return <>{renderLeaf(node, depth)}</>;
};
