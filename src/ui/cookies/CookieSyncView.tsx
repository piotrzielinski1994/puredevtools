import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { CookieMapping, SyncResult } from '../../cookies/model';
import { useToast } from '../components/ui/toast';
import { useDragWidth } from '../shared/useDragWidth';
import { useActionHotkeys } from '../shared/useActionHotkeys';
import { cn } from '../lib/utils';
import { CookieMappingForm } from './CookieMappingForm';
import { CookieSidebar } from './CookieSidebar';
import { createCookieGateway } from './createCookieGateway';
import type { CookieGateway } from './cookieGateway';

const SIDEBAR_DEFAULT = 320;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 560;

const nextMappingId = (mappings: CookieMapping[]): string => {
  const taken = new Set(mappings.map((mapping) => mapping.id));
  const find = (n: number): string => (taken.has(`mapping-${n}`) ? find(n + 1) : `mapping-${n}`);
  return find(mappings.length + 1);
};

const emptyMapping = (id: string): CookieMapping => ({
  id,
  name: '',
  enabled: true,
  sourceUrl: '',
  targetUrl: '',
  cookieNames: [],
});

const REASON_LABEL: Record<SyncResult['skipped'][number]['reason'], string> = {
  'not-found': 'not found on source',
  'set-rejected': 'rejected by browser',
};

const syncSummary = (result: SyncResult): string => {
  const base = `Copied ${result.copied.length} cookie${result.copied.length === 1 ? '' : 's'}`;
  if (result.skipped.length === 0) return base;
  const detail = result.skipped
    .map((entry) => `${entry.name} (${REASON_LABEL[entry.reason]})`)
    .join(', ');
  return `${base}, skipped ${result.skipped.length}: ${detail}`;
};

export const CookieSyncView = ({
  gateway,
  sidebarHeader,
}: {
  gateway?: CookieGateway;
  sidebarHeader?: React.ReactNode;
}) => {
  const api = useMemo(() => gateway ?? createCookieGateway(), [gateway]);
  const toast = useToast();
  const sidebar = useDragWidth(SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX);
  const [mappings, setMappings] = useState<CookieMapping[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    api.getAll().then((state) => {
      if (active) {
        setMappings(state.mappings);
        setSelectedId(state.mappings[0]?.id ?? null);
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [api]);

  const persist = (next: CookieMapping[]) => {
    setMappings(next);
    void api.save({ mappings: next });
  };

  const add = () => {
    const created = emptyMapping(nextMappingId(mappings));
    persist([...mappings, created]);
    setSelectedId(created.id);
  };
  const update = (mapping: CookieMapping) =>
    persist(mappings.map((current) => (current.id === mapping.id ? mapping : current)));
  const remove = (id: string) => {
    const next = mappings.filter((current) => current.id !== id);
    persist(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const sync = async (mapping: CookieMapping) => {
    const result = await api.sync(mapping);
    toast.show(syncSummary(result), result.skipped.length > 0 ? 'error' : 'success');
  };

  const selected = mappings.find((mapping) => mapping.id === selectedId) ?? null;

  useActionHotkeys({
    'new-item': add,
    'delete-item': () => {
      if (selectedId !== null) remove(selectedId);
    },
    'sync-mapping': () => {
      if (selected) void sync(selected);
    },
  });

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col bg-muted/30" style={{ width: sidebar.width }}>
        {sidebarHeader}
        {ready && mappings.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            No cookie mappings yet. Add one to copy cookies from a source URL to a target URL.
          </div>
        ) : (
          <CookieSidebar mappings={mappings} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={sidebar.onHandleMouseDown}
        className="relative w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2"
      />

      <section aria-label="Mapping editor" className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-stretch border-b bg-muted/30">
          <div role="tablist" className="flex h-full min-w-0 items-stretch overflow-x-auto">
            {mappings.map((mapping) => (
              <div
                key={mapping.id}
                role="tab"
                aria-current={mapping.id === selectedId ? 'true' : undefined}
                className={cn(
                  'flex items-center border-r border-r-border text-sm',
                  mapping.id === selectedId ? 'bg-background text-foreground' : 'text-muted-foreground',
                )}
              >
                <button
                  type="button"
                  className="h-full max-w-40 truncate px-3"
                  onClick={() => setSelectedId(mapping.id)}
                >
                  {mapping.name || '(unnamed mapping)'}
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            aria-label="Add mapping"
            onClick={add}
            className="shrink-0 px-2 text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" />
          </button>
        </div>
        {selected ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CookieMappingForm
              key={selected.id}
              mapping={selected}
              onChange={update}
              onDelete={() => remove(selected.id)}
              onSync={() => sync(selected)}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a mapping to edit
          </div>
        )}
      </section>
    </div>
  );
};
