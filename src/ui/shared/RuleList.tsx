import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from 'lucide-react';
import type { Rule } from '../../rules/model';
import { Switch } from '../components/ui/switch';
import { useRules } from './RulesProvider';

export type RuleListProps = {
  onEdit(rule: Rule): void;
  compact?: boolean;
  filter?: string;
};

const ACTION_LABELS: Record<Rule['actions'][number]['type'], string> = {
  modifyResponseHeaders: 'headers',
  rewriteBody: 'body',
};

const actionSummary = (rule: Rule): string => {
  const labels = rule.actions.map((action) => ACTION_LABELS[action.type]);
  return labels.length > 0 ? labels.join(', ') : 'no actions';
};

const matchesFilter = (rule: Rule, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return rule.name.toLowerCase().includes(needle) || rule.matchers.url.pattern.toLowerCase().includes(needle);
};

type MenuState = { rule: Rule; x: number; y: number };

type RowMenuItem = { label: string; icon: typeof Pencil; disabled?: boolean; onSelect(): void };

const RowContextMenu = ({ state, items, onClose }: { state: MenuState; items: RowMenuItem[]; onClose(): void }) => {
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
      aria-label={`Actions: ${state.rule.name}`}
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
          disabled={item.disabled}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
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

export const RuleList = ({ onEdit, compact = false, filter = '' }: RuleListProps) => {
  const { rules, updateRule, duplicateRule, removeRule, reorderRules } = useRules();
  const [menu, setMenu] = useState<MenuState | undefined>(undefined);

  if (rules.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-sm font-medium">No rules yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">Add one to start intercepting requests.</p>
      </div>
    );
  }

  const isFiltering = filter.trim() !== '';
  const visible = rules.filter((rule) => matchesFilter(rule, filter));

  if (visible.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-xs text-muted-foreground">No rules match “{filter.trim()}”.</p>
      </div>
    );
  }

  const move = (index: number, offset: number) => {
    const ids = rules.map((rule) => rule.id);
    const target = index + offset;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void reorderRules(ids);
  };

  const confirmRemove = (rule: Rule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    void removeRule(rule.id);
  };

  const menuItems = (rule: Rule, index: number): RowMenuItem[] => [
    { label: 'Move up', icon: ArrowUp, disabled: index === 0 || isFiltering, onSelect: () => move(index, -1) },
    { label: 'Move down', icon: ArrowDown, disabled: index === rules.length - 1 || isFiltering, onSelect: () => move(index, 1) },
    { label: 'Edit', icon: Pencil, onSelect: () => onEdit(rule) },
    { label: 'Duplicate', icon: Copy, onSelect: () => void duplicateRule(rule) },
    { label: 'Delete', icon: Trash2, onSelect: () => confirmRemove(rule) },
  ];

  return (
    <>
      <ul className="flex list-none flex-col p-0">
        {visible.map((rule) => {
          return (
            <li
              key={rule.id}
              onContextMenu={
                compact
                  ? undefined
                  : (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMenu({ rule, x: event.clientX, y: event.clientY });
                    }
              }
              className="group flex items-center gap-2 border-b border-b-border px-2 py-1.5 transition-colors last:border-b-0 hover:bg-accent/40"
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
                onClick={() => onEdit(rule)}
              >
                <p className={`truncate text-sm font-medium ${rule.enabled ? '' : 'text-muted-foreground line-through'}`}>
                  {rule.name}
                </p>
                {compact ? null : (
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{rule.matchers.url.pattern || '(any URL)'}</span> · {actionSummary(rule)}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {menu ? (
        <RowContextMenu
          state={menu}
          items={menuItems(menu.rule, rules.indexOf(menu.rule))}
          onClose={() => setMenu(undefined)}
        />
      ) : null}
    </>
  );
};
