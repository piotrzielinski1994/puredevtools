import { ChevronDown, ChevronRight } from "lucide-react";
import type { FolderNode, RuleNode, TreeNode } from "../../rules/model";
import { nodeId } from "../../rules/tree";
import { Switch } from "../components/ui/switch";
import { useRules } from "../shared/RulesProvider";

const PopupFolderRow = ({
  node,
  depth,
  onEdit,
}: {
  node: FolderNode;
  depth: number;
  onEdit(): void;
}) => {
  const { toggleCollapse } = useRules();
  const Chevron = node.collapsed ? ChevronRight : ChevronDown;
  return (
    <li>
      <button
        type="button"
        aria-label={`Folder: ${node.name}`}
        aria-expanded={!node.collapsed}
        onClick={() => void toggleCollapse(node.id)}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className="flex w-full items-center gap-1 border-b border-b-border py-1.5 pr-2 text-left text-sm font-medium hover:bg-accent/40"
      >
        <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
      {node.collapsed ? null : (
        <ul className="flex list-none flex-col p-0">
          {node.children.map((child) => (
            <PopupRow
              key={nodeId(child)}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

const PopupRuleRow = ({
  node,
  depth,
  onEdit,
}: {
  node: RuleNode;
  depth: number;
  onEdit(): void;
}) => {
  const { updateRule } = useRules();
  const rule = node.rule;
  return (
    <li
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      className="flex items-center gap-2 border-b border-b-border py-1.5 pr-2 transition-colors last:border-b-0 hover:bg-accent/40"
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
        onClick={onEdit}
      >
        <p
          className={`truncate text-sm font-medium ${rule.enabled ? "" : "text-muted-foreground line-through"}`}
        >
          {rule.name}
        </p>
      </button>
    </li>
  );
};

const PopupRow = ({
  node,
  depth,
  onEdit,
}: {
  node: TreeNode;
  depth: number;
  onEdit(): void;
}) => {
  if (node.kind === "folder")
    return <PopupFolderRow node={node} depth={depth} onEdit={onEdit} />;
  return <PopupRuleRow node={node} depth={depth} onEdit={onEdit} />;
};

export const PopupTree = ({ onEdit }: { onEdit(): void }) => {
  const { workspace } = useRules();
  if (workspace.length === 0) {
    return (
      <div className="border border-dashed border-border px-3 py-6 text-center">
        <p className="text-sm font-medium">No rules yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add one in options to start.
        </p>
      </div>
    );
  }
  return (
    <ul aria-label="Rules" className="flex list-none flex-col p-0">
      {workspace.map((node) => (
        <PopupRow key={nodeId(node)} node={node} depth={0} onEdit={onEdit} />
      ))}
    </ul>
  );
};
