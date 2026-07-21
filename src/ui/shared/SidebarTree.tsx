import { Copy, Pencil, Trash2 } from 'lucide-react';
import type { Rule, RuleNode } from '../../rules/model';
import { nodeId } from '../../rules/tree';
import { Switch } from '../components/ui/switch';
import { useRules } from './RulesProvider';
import { RuleRow } from './RuleRow';
import { TreeSidebar } from './TreeSidebar';
import type { ContextMenuItem } from './ContextMenu';
import type { TreeAdapter } from './treeAdapter';

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

export const SidebarTree = ({
  onEdit,
  onNewRule,
  filter = '',
}: {
  onEdit(ruleId: string): void;
  onNewRule?: () => void;
  filter?: string;
}) => {
  const { workspace, rules, updateRule, moveNode, addFolder, renameFolder, removeNode, duplicateRule, duplicateFolder, toggleCollapse } =
    useRules();
  const isFiltering = filter.trim() !== '';
  const filtered = rules.filter((rule) => matchesFilter(rule, filter));

  const leafMenuItems = (node: RuleNode): ContextMenuItem[] => [
    { label: 'Edit', icon: Pencil, onSelect: () => onEdit(node.rule.id) },
    { label: 'Duplicate', icon: Copy, onSelect: () => void duplicateRule(node.rule) },
    { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => void removeNode(node.rule.id) },
  ];

  const ruleById = (id: string): Rule | undefined => rules.find((rule) => rule.id === id);

  const adapter: TreeAdapter<RuleNode> = {
    workspace,
    nodeId,
    isFiltering,
    renderFiltered: () => <FilteredList rules={filtered} filter={filter} onEdit={onEdit} onToggle={updateRule} />,
    renderLeaf: (node, depth) => <RuleRow node={node} depth={depth} onToggle={(rule) => void updateRule(rule)} />,
    leafLabel: (node) => node.rule.name,
    leafMenuItems,
    onActivateLeaf: onEdit,
    duplicateLeaf: (id) => {
      const rule = ruleById(id);
      if (rule) void duplicateRule(rule);
    },
    onNewLeaf: () => onNewRule?.(),
    newLeafLabel: 'New rule',
    treeLabel: 'Rules',
    emptyTitle: 'No rules yet.',
    emptyHint: 'Add a rule or a folder to start.',
    moveNode: (dragId, target) => moveNode(dragId, target),
    addFolder,
    renameFolder: (id, name) => renameFolder(id, name),
    removeNode: (id) => removeNode(id),
    duplicateFolder: (id) => duplicateFolder(id),
    toggleCollapse: (id) => toggleCollapse(id),
    confirmRemoveLabel: (node) =>
      node.kind === 'folder' ? `folder "${node.name}" and everything in it` : `rule "${node.rule.name}"`,
  };

  return <TreeSidebar adapter={adapter} />;
};
