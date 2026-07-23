import type { CookieMapping } from "../../cookies/model";

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const subtitle = (mapping: CookieMapping): string =>
  `${hostOf(mapping.sourceUrl) || "(source)"} → ${hostOf(mapping.targetUrl) || "(target)"}`;

export const CookieSidebar = ({
  mappings,
  selectedId,
  onSelect,
}: {
  mappings: CookieMapping[];
  selectedId: string | null;
  onSelect(id: string): void;
}) => (
  <nav aria-label="Cookie mappings" className="min-h-0 flex-1 overflow-y-auto">
    <ul className="flex list-none flex-col p-0">
      {mappings.map((mapping) => (
        <li
          key={mapping.id}
          className="border-b border-b-border last:border-b-0"
        >
          <button
            type="button"
            aria-current={mapping.id === selectedId}
            onClick={() => onSelect(mapping.id)}
            className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent/40 ${
              mapping.id === selectedId ? "bg-accent" : ""
            }`}
          >
            <span className="truncate text-sm font-medium">
              {mapping.name || "(unnamed mapping)"}
            </span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {subtitle(mapping)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  </nav>
);
