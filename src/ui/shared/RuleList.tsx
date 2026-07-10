import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from 'lucide-react';
import type { Rule } from '../../rules/model';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { useRules } from './RulesProvider';

export type RuleListProps = {
  onEdit(rule: Rule): void;
  compact?: boolean;
  filter?: string;
};

const actionSummary = (rule: Rule): string => {
  const labels = rule.actions.map((action) => action.type);
  return labels.length > 0 ? labels.join(', ') : 'no actions';
};

const matchesFilter = (rule: Rule, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return rule.name.toLowerCase().includes(needle) || rule.matchers.url.pattern.toLowerCase().includes(needle);
};

export const RuleList = ({ onEdit, compact = false, filter = '' }: RuleListProps) => {
  const { rules, updateRule, duplicateRule, removeRule, reorderRules } = useRules();

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

  return (
    <ul className="flex list-none flex-col p-0">
      {visible.map((rule) => {
        const index = rules.indexOf(rule);
        return (
          <li
            key={rule.id}
            className="group flex items-center gap-2 border-b border-b-border px-2 py-1.5 transition-colors last:border-b-0 hover:bg-accent/40"
          >
            <Switch
              aria-label={`Enabled: ${rule.name}`}
              checked={rule.enabled}
              onChange={() => void updateRule({ ...rule, enabled: !rule.enabled })}
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${rule.enabled ? '' : 'text-muted-foreground line-through'}`}>
                {rule.name}
              </p>
              {compact ? null : (
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{rule.matchers.url.pattern || '(any URL)'}</span> · {actionSummary(rule)}
                </p>
              )}
            </div>
            {compact ? null : (
              <div className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move up: ${rule.name}`}
                  disabled={index === 0 || isFiltering}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move down: ${rule.name}`}
                  disabled={index === rules.length - 1 || isFiltering}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Edit: ${rule.name}`} onClick={() => onEdit(rule)}>
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Duplicate: ${rule.name}`}
                  onClick={() => void duplicateRule(rule)}
                >
                  <Copy />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete: ${rule.name}`}
                  onClick={() => confirmRemove(rule)}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
