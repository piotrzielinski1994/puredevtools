import { useMemo, useState } from 'react';
import type { PanelEntry } from '../../devtools/types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export type InterceptTableProps = {
  entries: PanelEntry[];
  onClear(): void;
};

const prettyBody = (body: string): string => {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
};

const statusTone = (status: number): string => {
  if (status >= 500) return 'text-destructive';
  if (status >= 400) return 'text-amber-600';
  return 'text-emerald-600';
};

export const formatTime = (timestamp?: number): string => {
  if (timestamp === undefined) return '';
  const date = new Date(timestamp);
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const DetailSection = ({ title, children }: { title: string; children: string }) => (
  <section>
    <h3 className="border-b px-3 py-1.5 text-xs font-semibold text-muted-foreground">{title}</h3>
    <pre className="overflow-auto whitespace-pre-wrap wrap-break-word p-3 font-mono text-xs">{children}</pre>
  </section>
);

export const InterceptTable = ({ entries, onClear }: InterceptTableProps) => {
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (query === '') return entries;
    return entries.filter((entry) => entry.url.toLowerCase().includes(query));
  }, [entries, filter]);

  const selected = entries.find((entry) => entry.id === selectedId);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button type="button" variant="outline" size="sm" onClick={onClear}>
          Clear
        </Button>
        <Input
          aria-label="Filter by URL"
          placeholder="Filter URLs"
          className="h-8 max-w-xs"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length} intercepted
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-1.5 font-medium">Time</th>
                <th className="px-3 py-1.5 font-medium">Type</th>
                <th className="px-3 py-1.5 font-medium">Method</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
                <th className="px-3 py-1.5 font-medium">URL</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={`cursor-pointer border-b last:border-b-0 hover:bg-accent/40 ${entry.id === selectedId ? 'bg-accent' : ''}`}
                >
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{formatTime(entry.timestamp)}</td>
                  <td className="px-3 py-1.5">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {entry.kind}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">{entry.method}</td>
                  <td className={`px-3 py-1.5 font-mono text-xs ${statusTone(entry.status)}`}>{entry.status}</td>
                  <td className="max-w-0 truncate px-3 py-1.5 font-mono text-xs" title={entry.url}>
                    {entry.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No intercepted requests yet. Requests matched by a mock or rewrite rule appear here.
            </div>
          ) : null}
          {entries.length > 0 && visible.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No intercepted requests match the filter.
            </div>
          ) : null}
        </div>

        {selected ? (
          <aside className="flex w-2/5 min-w-0 flex-col border-l">
            <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
              <div className="min-w-0">
                <p className="font-mono text-xs font-medium">
                  {selected.method} {selected.status} · {selected.kind}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground" title={selected.url}>
                  {selected.url}
                </p>
                {selected.contentType ? (
                  <p className="text-xs text-muted-foreground">{selected.contentType}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Copy response body"
                onClick={() => void navigator.clipboard?.writeText(selected.body)}
              >
                Copy
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {selected.requestHeaders && Object.keys(selected.requestHeaders).length > 0 ? (
                <DetailSection title="Request headers">
                  {Object.entries(selected.requestHeaders)
                    .map(([name, value]) => `${name}: ${value}`)
                    .join('\n')}
                </DetailSection>
              ) : null}
              {selected.requestBody ? (
                <DetailSection title="Request body">{prettyBody(selected.requestBody)}</DetailSection>
              ) : null}
              <DetailSection title="Response body">{prettyBody(selected.body)}</DetailSection>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
};
