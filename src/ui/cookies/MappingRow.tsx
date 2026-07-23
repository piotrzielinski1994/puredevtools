import type { CookieMapping, CookieMappingNode } from "../../cookies/model";
import { LeafRow, useTreeUi } from "../shared/TreeRow";

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const subtitle = (mapping: CookieMapping): string =>
  `${hostOf(mapping.sourceUrl) || "(source)"} → ${hostOf(mapping.targetUrl) || "(target)"}`;

export const MappingRow = ({
  node,
  depth,
}: {
  node: CookieMappingNode;
  depth: number;
}) => {
  const { onActivateLeaf } = useTreeUi();
  const mapping = node.mapping;

  return (
    <LeafRow
      node={node}
      id={mapping.id}
      ariaLabel={`Mapping: ${mapping.name || "(unnamed mapping)"}`}
      depth={depth}
    >
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer text-left"
        aria-label={`Edit: ${mapping.name || "(unnamed mapping)"}`}
        onClick={() => onActivateLeaf(mapping.id)}
      >
        <p className="truncate text-sm font-medium">
          {mapping.name || "(unnamed mapping)"}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {subtitle(mapping)}
        </p>
      </button>
    </LeafRow>
  );
};
