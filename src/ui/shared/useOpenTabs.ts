import { useEffect, useRef, useState } from 'react';

export const DRAFT_KEY = 'new:draft';

export type OpenTabsState = { openKeys: string[]; activeKey: string | null };

export type TabsStore = {
  load(): Promise<OpenTabsState>;
  save(state: OpenTabsState): void;
};

export type OpenTabsOptions = { store?: TabsStore; ready?: boolean };

export type OpenTabs = OpenTabsState & {
  open(key: string): void;
  close(key: string): void;
  setActive(key: string): void;
};

const adjacentKey = (keys: string[], removedIndex: number): string | null => {
  if (keys.length === 0) return null;
  const previous = removedIndex - 1;
  if (previous >= 0) return keys[previous];
  return keys[0];
};

const stripDraft = (state: OpenTabsState): OpenTabsState => {
  const openKeys = state.openKeys.filter((key) => key !== DRAFT_KEY);
  const activeKey = state.activeKey === DRAFT_KEY ? (openKeys.at(-1) ?? null) : state.activeKey;
  return { openKeys, activeKey };
};

const reconcile = (loaded: OpenTabsState, ruleIds: string[]): OpenTabsState => {
  const survives = (key: string) => key === DRAFT_KEY || ruleIds.includes(key);
  const openKeys = loaded.openKeys.filter(survives);
  const activeKey =
    loaded.activeKey !== null && openKeys.includes(loaded.activeKey)
      ? loaded.activeKey
      : (openKeys.at(-1) ?? null);
  return { openKeys, activeKey };
};

export const useOpenTabs = (ruleIds: string[], opts: OpenTabsOptions = {}): OpenTabs => {
  const { store, ready = false } = opts;
  const [state, setState] = useState<OpenTabsState>({ openKeys: [], activeKey: null });

  const hydratedRef = useRef(false);
  const ruleIdsRef = useRef(ruleIds);
  ruleIdsRef.current = ruleIds;

  useEffect(() => {
    if (!store || !ready || hydratedRef.current) return;
    let active = true;
    void store.load().then((loaded) => {
      if (!active) return;
      hydratedRef.current = true;
      setState(reconcile(loaded, ruleIdsRef.current));
    });
    return () => {
      active = false;
    };
  }, [store, ready]);

  useEffect(() => {
    if (!store || !hydratedRef.current) return;
    store.save(stripDraft(state));
  }, [state, store]);

  useEffect(() => {
    setState((current) => {
      const survives = (key: string) => key === DRAFT_KEY || ruleIds.includes(key);
      const nextKeys = current.openKeys.filter(survives);
      if (nextKeys.length === current.openKeys.length) return current;
      if (current.activeKey !== null && survives(current.activeKey)) {
        return { openKeys: nextKeys, activeKey: current.activeKey };
      }
      const removedIndex = current.openKeys.findIndex((key) => !survives(key));
      const remainingBeforeRemoved = current.openKeys.slice(0, removedIndex).filter(survives).length;
      return { openKeys: nextKeys, activeKey: adjacentKey(nextKeys, remainingBeforeRemoved) };
    });
  }, [ruleIds]);

  const open = (key: string) =>
    setState((current) =>
      current.openKeys.includes(key)
        ? { ...current, activeKey: key }
        : { openKeys: [...current.openKeys, key], activeKey: key },
    );

  const close = (key: string) =>
    setState((current) => {
      const index = current.openKeys.indexOf(key);
      if (index === -1) return current;
      const nextKeys = current.openKeys.filter((open) => open !== key);
      if (current.activeKey !== key) return { openKeys: nextKeys, activeKey: current.activeKey };
      return { openKeys: nextKeys, activeKey: adjacentKey(nextKeys, index) };
    });

  const setActive = (key: string) => setState((current) => ({ ...current, activeKey: key }));

  return { ...state, open, close, setActive };
};
