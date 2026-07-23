import { Button } from "@pziel/pureui";
import { RefreshCw, Trash2 } from "lucide-react";
import type { CookieMapping } from "../../cookies/model";
import { Input } from "../components/ui/input";

const parseNames = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

const namesToText = (names: string[]): string => names.join(", ");

type Props = {
  mapping: CookieMapping;
  onChange: (mapping: CookieMapping) => void;
  onDelete: () => void;
  onSync: () => void;
};

export const CookieMappingForm = ({
  mapping,
  onChange,
  onDelete,
  onSync,
}: Props) => (
  <div className="flex flex-col gap-3 p-4">
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      Name
      <Input
        aria-label="Mapping name"
        className="font-mono"
        placeholder="prod auth -> localhost"
        value={mapping.name}
        onChange={(event) => onChange({ ...mapping, name: event.target.value })}
      />
    </label>
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      Source URL
      <Input
        aria-label="Source URL"
        className="font-mono"
        placeholder="https://app.prod.com"
        value={mapping.sourceUrl}
        onChange={(event) =>
          onChange({ ...mapping, sourceUrl: event.target.value })
        }
      />
    </label>
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      Target URL
      <Input
        aria-label="Target URL"
        className="font-mono"
        placeholder="http://localhost:3000"
        value={mapping.targetUrl}
        onChange={(event) =>
          onChange({ ...mapping, targetUrl: event.target.value })
        }
      />
    </label>
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      Cookie names
      <Input
        aria-label="Cookie names"
        className="font-mono"
        placeholder="auth, sid, refresh"
        value={namesToText(mapping.cookieNames)}
        onChange={(event) =>
          onChange({ ...mapping, cookieNames: parseNames(event.target.value) })
        }
      />
    </label>
    <div className="flex items-center gap-2 pt-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Sync now"
        disabled={
          mapping.sourceUrl.trim() === "" || mapping.targetUrl.trim() === ""
        }
        onClick={onSync}
      >
        <RefreshCw />
        Sync now
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Delete mapping"
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  </div>
);
