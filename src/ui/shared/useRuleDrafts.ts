import { useCallback, useMemo, useState } from 'react';
import type { RuleDraft } from './ruleDraft';

export type RuleDrafts = {
  getEdit(key: string): RuleDraft | undefined;
  setEdit(key: string, draft: RuleDraft): void;
  discard(key: string): void;
  prune(survivingKeys: string[]): void;
};

export const useRuleDrafts = (): RuleDrafts => {
  const [edits, setEdits] = useState<Map<string, RuleDraft>>(new Map());

  const getEdit = useCallback((key: string) => edits.get(key), [edits]);

  const setEdit = useCallback((key: string, draft: RuleDraft) => {
    setEdits((current) => new Map(current).set(key, draft));
  }, []);

  const discard = useCallback((key: string) => {
    setEdits((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  const prune = useCallback((survivingKeys: string[]) => {
    setEdits((current) => {
      const survives = new Set(survivingKeys);
      const kept = [...current].filter(([key]) => survives.has(key));
      if (kept.length === current.size) return current;
      return new Map(kept);
    });
  }, []);

  return useMemo(() => ({ getEdit, setEdit, discard, prune }), [getEdit, setEdit, discard, prune]);
};
