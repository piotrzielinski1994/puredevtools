import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { Rule, TreeNode } from '../../rules/model';
import { flatten, type MoveTarget } from '../../rules/tree';
import type { ImportMode, ImportOutcome, UiGateway } from './gateway';

export type RulesContextValue = {
  workspace: TreeNode[];
  rules: Rule[];
  globalEnabled: boolean;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  addRule(rule: Rule): Promise<void>;
  updateRule(rule: Rule): Promise<void>;
  duplicateRule(rule: Rule): Promise<void>;
  duplicateFolder(id: string): Promise<void>;
  removeNode(id: string): Promise<void>;
  moveNode(dragId: string, target: MoveTarget): Promise<void>;
  addFolder(parentId: string | null): Promise<string>;
  renameFolder(id: string, name: string): Promise<void>;
  toggleCollapse(id: string): Promise<void>;
  toggleGlobal(enabled: boolean): Promise<void>;
  exportRules(): Promise<void>;
  importRules(json: string, mode?: ImportMode): Promise<ImportOutcome>;
};

const RulesContext = createContext<RulesContextValue | undefined>(undefined);

const nextCopyId = (rules: Rule[], baseId: string): string => {
  const taken = new Set(rules.map((rule) => rule.id));
  let candidate = `${baseId}-copy`;
  let suffix = 1;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-copy-${suffix}`;
  }
  return candidate;
};

export const RulesProvider = ({ gateway, children }: { gateway: UiGateway; children: ReactNode }) => {
  const [workspace, setWorkspace] = useState<TreeNode[]>([]);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [status, setStatus] = useState<RulesContextValue['status']>('loading');
  const [error, setError] = useState<string | undefined>(undefined);

  const rules = useMemo(() => flatten(workspace), [workspace]);

  const refresh = useCallback(async () => {
    const [loadedWorkspace, loadedGlobal] = await Promise.all([
      gateway.getWorkspace(),
      gateway.getGlobalEnabled(),
    ]);
    setWorkspace(loadedWorkspace);
    setGlobalEnabled(loadedGlobal);
  }, [gateway]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refresh();
        if (!active) return;
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
      await gateway.addRule(rule);
      await refresh();
    },
    [gateway, refresh],
  );

  const updateRule = useCallback(
    async (rule: Rule) => {
      await gateway.updateRule(rule);
      await refresh();
    },
    [gateway, refresh],
  );

  const duplicateRule = useCallback(
    async (rule: Rule) => {
      await gateway.duplicateRule(rule, nextCopyId(rules, rule.id));
      await refresh();
    },
    [gateway, refresh, rules],
  );

  const duplicateFolder = useCallback(
    async (id: string) => {
      await gateway.duplicateNode(id);
      await refresh();
    },
    [gateway, refresh],
  );

  const removeNode = useCallback(
    async (id: string) => {
      await gateway.removeNode(id);
      await refresh();
    },
    [gateway, refresh],
  );

  const moveNode = useCallback(
    async (dragId: string, target: MoveTarget) => {
      await gateway.moveNode(dragId, target);
      await refresh();
    },
    [gateway, refresh],
  );

  const addFolder = useCallback(
    async (parentId: string | null) => {
      const id = await gateway.addFolder(parentId);
      await refresh();
      return id;
    },
    [gateway, refresh],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await gateway.renameFolder(id, name);
      await refresh();
    },
    [gateway, refresh],
  );

  const toggleCollapse = useCallback(
    async (id: string) => {
      await gateway.toggleCollapse(id);
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
    async (json: string, mode: ImportMode = 'replace') => {
      const outcome = await gateway.importFromFile(json, mode);
      if (outcome.ok) await refresh();
      return outcome;
    },
    [gateway, refresh],
  );

  const value: RulesContextValue = {
    workspace,
    rules,
    globalEnabled,
    status,
    error,
    addRule,
    updateRule,
    duplicateRule,
    duplicateFolder,
    removeNode,
    moveNode,
    addFolder,
    renameFolder,
    toggleCollapse,
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
