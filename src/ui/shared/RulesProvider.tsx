import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Capabilities } from '../../engine/RequestEngine';
import type { Rule } from '../../rules/model';
import { cloneRule } from '../../rules/clone';
import type { ImportOutcome, UiGateway } from './gateway';

export type RulesContextValue = {
  rules: Rule[];
  globalEnabled: boolean;
  capabilities: Capabilities;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  addRule(rule: Rule): Promise<void>;
  updateRule(rule: Rule): Promise<void>;
  duplicateRule(rule: Rule): Promise<void>;
  removeRule(id: string): Promise<void>;
  reorderRules(ids: string[]): Promise<void>;
  toggleGlobal(enabled: boolean): Promise<void>;
  exportRules(): Promise<void>;
  importRules(json: string): Promise<ImportOutcome>;
};

const RulesContext = createContext<RulesContextValue | undefined>(undefined);

const DISABLED_CAPABILITIES: Capabilities = { responseBodyRewrite: false, artificialLatency: false };

export const RulesProvider = ({ gateway, children }: { gateway: UiGateway; children: ReactNode }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [capabilities, setCapabilities] = useState<Capabilities>(DISABLED_CAPABILITIES);
  const [status, setStatus] = useState<RulesContextValue['status']>('loading');
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [loadedRules, loadedGlobal] = await Promise.all([gateway.getAll(), gateway.getGlobalEnabled()]);
    setRules(loadedRules);
    setGlobalEnabled(loadedGlobal);
  }, [gateway]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refresh();
        const caps = await gateway.getCapabilities().catch(() => DISABLED_CAPABILITIES);
        if (!active) return;
        setCapabilities(caps);
        setStatus('ready');
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setStatus('error');
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [gateway, refresh]);

  const addRule = useCallback(
    async (rule: Rule) => {
      await gateway.add(rule);
      await refresh();
    },
    [gateway, refresh],
  );

  const updateRule = useCallback(
    async (rule: Rule) => {
      await gateway.update(rule);
      await refresh();
    },
    [gateway, refresh],
  );

  const duplicateRule = useCallback(
    async (rule: Rule) => {
      const taken = new Set(rules.map((existing) => existing.id));
      let suffix = 1;
      let newId = `${rule.id}-copy`;
      while (taken.has(newId)) {
        suffix += 1;
        newId = `${rule.id}-copy-${suffix}`;
      }
      await gateway.add(cloneRule(rule, newId));
      await refresh();
    },
    [gateway, refresh, rules],
  );

  const removeRule = useCallback(
    async (id: string) => {
      await gateway.remove(id);
      await refresh();
    },
    [gateway, refresh],
  );

  const reorderRules = useCallback(
    async (ids: string[]) => {
      await gateway.reorder(ids);
      await refresh();
    },
    [gateway, refresh],
  );

  const toggleGlobal = useCallback(
    async (enabled: boolean) => {
      await gateway.setGlobalEnabled(enabled);
      setGlobalEnabled(enabled);
    },
    [gateway],
  );

  const exportRules = useCallback(() => gateway.exportToFile(), [gateway]);

  const importRules = useCallback(
    async (json: string) => {
      const outcome = await gateway.importFromFile(json);
      if (outcome.ok) await refresh();
      return outcome;
    },
    [gateway, refresh],
  );

  const value: RulesContextValue = {
    rules,
    globalEnabled,
    capabilities,
    status,
    error,
    addRule,
    updateRule,
    duplicateRule,
    removeRule,
    reorderRules,
    toggleGlobal,
    exportRules,
    importRules,
  };

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
};

export const useRules = (): RulesContextValue => {
  const value = useContext(RulesContext);
  if (!value) throw new Error('useRules must be used within a RulesProvider');
  return value;
};
