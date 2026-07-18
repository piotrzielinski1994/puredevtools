import browser from 'webextension-polyfill';
import type { TreeNode } from '../../rules/model';
import { cloneRule } from '../../rules/clone';
import { exportRules, importRules } from '../../rules/portable';
import { mergeRules } from '../../rules/merge';
import { RuleRepository } from '../../rules/storage';
import type { ImportOutcome, UiGateway } from './gateway';

const download = (json: string) => {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'puredevtools.json';
  anchor.click();
  URL.revokeObjectURL(url);
};

export const createGateway = (): UiGateway => {
  const repository = new RuleRepository(browser.storage.local);

  const persist = async (workspace: TreeNode[], globalEnabled: boolean) => {
    await repository.replaceAll(workspace);
    await repository.setGlobalEnabled(globalEnabled);
  };

  return {
    getWorkspace: () => repository.getWorkspace(),
    getGlobalEnabled: () => repository.getGlobalEnabled(),
    addRule: (rule) => repository.addRuleNode(rule),
    updateRule: (rule) => repository.updateRule(rule),
    duplicateRule: (rule, newId) => repository.addRuleNode(cloneRule(rule, newId)),
    removeNode: (id) => repository.removeNode(id),
    moveNode: (dragId, target) => repository.moveNode(dragId, target),
    addFolder: (parentId) => repository.addFolder(parentId),
    renameFolder: (id, name) => repository.renameFolder(id, name),
    toggleCollapse: (id) => repository.toggleCollapse(id),
    setGlobalEnabled: (enabled) => repository.setGlobalEnabled(enabled),
    exportToFile: async () => {
      const [workspace, enabled] = await Promise.all([
        repository.getWorkspace(),
        repository.getGlobalEnabled(),
      ]);
      download(exportRules({ enabled, workspace }));
    },
    importFromFile: async (json, mode): Promise<ImportOutcome> => {
      const result = importRules(json);
      if (!result.ok) return { ok: false, error: result.error };
      if (mode === 'merge') {
        const current = await repository.getWorkspace();
        await persist(mergeRules(current, result.state.workspace), await repository.getGlobalEnabled());
        return { ok: true };
      }
      await persist(result.state.workspace, result.state.enabled);
      return { ok: true };
    },
  };
};
