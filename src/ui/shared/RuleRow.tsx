import type { RuleAction, RuleNode } from "../../rules/model";
import { Switch } from "../components/ui/switch";
import { LeafRow, useTreeUi } from "./TreeRow";

const ACTION_LABELS: Record<RuleAction["type"], string> = {
  modifyRequestHeaders: "request headers",
  rewriteRequestBody: "request body",
  rewriteRequestUrl: "request url",
  preScript: "pre-script",
  modifyResponseHeaders: "response headers",
  rewriteBody: "response body",
  postScript: "post-script",
};

const actionSummary = (node: RuleNode): string => {
  const labels = node.rule.actions
    .map((action) => ACTION_LABELS[action.type])
    .filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "no actions";
};

export const RuleRow = ({
  node,
  depth,
  onToggle,
}: {
  node: RuleNode;
  depth: number;
  onToggle(rule: RuleNode["rule"]): void;
}) => {
  const { onActivateLeaf } = useTreeUi();
  const rule = node.rule;

  return (
    <LeafRow
      node={node}
      id={rule.id}
      ariaLabel={`Rule: ${rule.name}`}
      depth={depth}
    >
      <Switch
        aria-label={`Enabled: ${rule.name}`}
        checked={rule.enabled}
        onChange={() => onToggle({ ...rule, enabled: !rule.enabled })}
      />
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer text-left"
        aria-label={`Edit: ${rule.name}`}
        onClick={() => onActivateLeaf(rule.id)}
      >
        <p
          className={`truncate text-sm font-medium ${rule.enabled ? "" : "text-muted-foreground line-through"}`}
        >
          {rule.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">
            {rule.matchers.url.pattern || "(any URL)"}
          </span>{" "}
          ·{" "}
          <span data-testid={`rule-action-summary-${rule.id}`}>
            {actionSummary(node)}
          </span>
        </p>
      </button>
    </LeafRow>
  );
};
