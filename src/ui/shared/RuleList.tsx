import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import type { Rule } from '../../rules/model';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { useRules } from './RulesProvider';

export type RuleListProps = {
  onEdit(rule: Rule): void;
};

const actionSummary = (rule: Rule): string => {
  const labels = rule.actions.map((action) => action.type);
  return labels.length > 0 ? labels.join(', ') : 'no actions';
};

export const RuleList = ({ onEdit }: RuleListProps) => {
  const { rules, updateRule, removeRule, reorderRules } = useRules();

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
        <p className="text-sm font-medium">No rules yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">Add one to start intercepting requests.</p>
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
    <ul className="flex list-none flex-col gap-2 p-0">
      {rules.map((rule, index) => (
        <li
          key={rule.id}
          className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-colors hover:bg-accent/40"
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
            <p className="truncate text-xs text-muted-foreground">
              {rule.matchers.url.pattern || '(any URL)'} · {actionSummary(rule)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move up: ${rule.name}`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move down: ${rule.name}`}
            disabled={index === rules.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown />
          </Button>
          <Button type="button" variant="outline" size="sm" aria-label={`Edit: ${rule.name}`} onClick={() => onEdit(rule)}>
            <Pencil />
            Edit
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
        </li>
      ))}
    </ul>
  );
};
