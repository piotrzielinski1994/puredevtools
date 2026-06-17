import type { Rule } from '../../rules/model';
import { useRules } from './RulesProvider';

export type RuleListProps = {
  onEdit(rule: Rule): void;
};

export const RuleList = ({ onEdit }: RuleListProps) => {
  const { rules, updateRule, removeRule, reorderRules } = useRules();

  if (rules.length === 0) {
    return <p>No rules yet. Add one to start intercepting requests.</p>;
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
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {rules.map((rule, index) => (
        <li
          key={rule.id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #eee' }}
        >
          <input
            type="checkbox"
            role="switch"
            aria-label={`Enabled: ${rule.name}`}
            checked={rule.enabled}
            onChange={() => void updateRule({ ...rule, enabled: !rule.enabled })}
          />
          <span style={{ flex: 1 }}>{rule.name}</span>
          <button type="button" aria-label={`Move up: ${rule.name}`} disabled={index === 0} onClick={() => move(index, -1)}>
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move down: ${rule.name}`}
            disabled={index === rules.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
          <button type="button" aria-label={`Edit: ${rule.name}`} onClick={() => onEdit(rule)}>
            Edit
          </button>
          <button type="button" aria-label={`Delete: ${rule.name}`} onClick={() => confirmRemove(rule)}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
};
