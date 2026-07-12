import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { FolderNode, RuleNode, TreeNode } from '../../rules/model';
import { emptyZoneId } from '../../rules/tree-locate';
import { Switch } from '../components/ui/switch';
import { cn } from '../lib/utils';
import { useRules } from './RulesProvider';
import { useTreeDnd } from './tree-dnd';

export type TreeUiContextValue = {
  onEdit(ruleId: string): void;
  onContextMenu(node: TreeNode, x: number, y: number): void;
  renamingId: string | undefined;
  beginRename(id: string): void;
  commitRename(id: string, name: string): void;
  cancelRename(): void;
  draggable: boolean;
};

const TreeUiContext = createContext<TreeUiContextValue | undefined>(undefined);

export const TreeUiProvider = TreeUiContext.Provider;

const useTreeUi = (): TreeUiContextValue => {
  const value = useContext(TreeUiContext);
  if (!value) throw new Error('TreeRow must be used within a TreeUiProvider');
  return value;
};

const useRowDnd = (id: string, enabled: boolean) => {
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

const DropLine = () => (
  <div aria-hidden="true" data-testid="drop-line" className="pointer-events-none h-0.5 bg-primary" />
);

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

const FolderRow = ({ node, depth }: { node: FolderNode; depth: number }) => {
  const { toggleCollapse } = useRules();
  const { onContextMenu, renamingId, beginRename, draggable } = useTreeUi();
  const { activeId } = useTreeDnd();
  const { attributes, listeners, setNodeRef, isDragging, dropBefore, dropAfter, dropInside } = useRowDnd(
    node.id,
    draggable,
  );
  const Chevron = node.collapsed ? ChevronRight : ChevronDown;
  const isEmpty = node.children.length === 0;
  const isDragActive = activeId !== null && activeId !== node.id;
  const isRenaming = renamingId === node.id;

  return (
    <li className="relative">
      {dropBefore ? <DropLine /> : null}
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        role="treeitem"
        aria-expanded={!node.collapsed}
        aria-label={`Folder: ${node.name}`}
        onContextMenu={
          draggable
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(node, event.clientX, event.clientY);
              }
            : undefined
        }
        onClick={() => void toggleCollapse(node.id)}
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
            <TreeRow key={child.kind === 'rule' ? child.rule.id : child.id} node={child} depth={depth + 1} />
          ))}
          {isEmpty && isDragActive ? <EmptyDropZone folderId={node.id} depth={depth + 1} /> : null}
        </ul>
      )}
    </li>
  );
};

const ACTION_LABELS: Record<string, string> = {
  modifyResponseHeaders: 'headers',
  rewriteBody: 'body',
};

const actionSummary = (node: RuleNode): string => {
  const labels = node.rule.actions.map((action) => ACTION_LABELS[action.type]);
  return labels.length > 0 ? labels.join(', ') : 'no actions';
};

const RuleRow = ({ node, depth }: { node: RuleNode; depth: number }) => {
  const { updateRule } = useRules();
  const { onEdit, onContextMenu, draggable } = useTreeUi();
  const { attributes, listeners, setNodeRef, isDragging, dropBefore, dropAfter } = useRowDnd(node.rule.id, draggable);
  const rule = node.rule;

  return (
    <li className="relative">
      {dropBefore ? <DropLine /> : null}
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        role="treeitem"
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
        <Switch
          aria-label={`Enabled: ${rule.name}`}
          checked={rule.enabled}
          onChange={() => void updateRule({ ...rule, enabled: !rule.enabled })}
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
            <span className="font-mono">{rule.matchers.url.pattern || '(any URL)'}</span> · {actionSummary(node)}
          </p>
        </button>
      </div>
      {dropAfter ? <DropLine /> : null}
    </li>
  );
};

export const TreeRow = ({ node, depth }: { node: TreeNode; depth: number }) => {
  if (node.kind === 'folder') return <FolderRow node={node} depth={depth} />;
  return <RuleRow node={node} depth={depth} />;
};
