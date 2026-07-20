import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { CookieMapping } from '../../cookies/model';
import { Button } from '../components/ui/button';
import { useToast } from '../components/ui/toast';
import { CookieMappingForm } from './CookieMappingForm';
import { createCookieGateway } from './createCookieGateway';
import type { CookieGateway } from './cookieGateway';

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

const syncSummary = (copied: number, skipped: number): string => {
  const base = `Copied ${copied} cookie${copied === 1 ? '' : 's'}`;
  return skipped > 0 ? `${base}, skipped ${skipped}` : base;
};

export const CookieSyncView = ({ gateway }: { gateway?: CookieGateway }) => {
  const api = useMemo(() => gateway ?? createCookieGateway(), [gateway]);
  const toast = useToast();
  const [mappings, setMappings] = useState<CookieMapping[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    api.getAll().then((state) => {
      if (active) {
        setMappings(state.mappings);
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

  const add = () => persist([...mappings, emptyMapping(nextMappingId(mappings))]);
  const update = (mapping: CookieMapping) =>
    persist(mappings.map((current) => (current.id === mapping.id ? mapping : current)));
  const remove = (id: string) => persist(mappings.filter((current) => current.id !== id));

  const sync = async (mapping: CookieMapping) => {
    const result = await api.sync(mapping);
    toast.show(syncSummary(result.copied.length, result.skipped.length), 'success');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3 text-sm font-semibold">
        Cookie sync
        <Button type="button" variant="ghost" size="sm" aria-label="Add mapping" onClick={add}>
          <Plus />
          Add mapping
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ready && mappings.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            No cookie mappings yet. Add one to copy cookies from a source URL to a target URL.
          </div>
        ) : (
          mappings.map((mapping) => (
            <CookieMappingForm
              key={mapping.id}
              mapping={mapping}
              onChange={update}
              onDelete={() => remove(mapping.id)}
              onSync={() => sync(mapping)}
            />
          ))
        )}
      </div>
    </div>
  );
};
