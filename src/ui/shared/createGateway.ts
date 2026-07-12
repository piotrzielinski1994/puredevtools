import browser from 'webextension-polyfill';
import type { Rule } from '../../rules/model';
import { exportRules, importRules } from '../../rules/portable';
import { mergeRules } from '../../rules/merge';
import { RuleRepository } from '../../rules/storage';
import type { ImportOutcome, UiGateway } from './gateway';

const download = (json: string) => {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'reqhook-rules.json';
  anchor.click();
  URL.revokeObjectURL(url);
};

export const createGateway = (): UiGateway => {
  const repository = new RuleRepository(browser.storage.local);

  const persist = async (rules: Rule[], globalEnabled: boolean) => {
    await repository.replaceAll(rules);
    await repository.setGlobalEnabled(globalEnabled);
  };

  return {
    getAll: () => repository.getAll(),
    getGlobalEnabled: () => repository.getGlobalEnabled(),
    add: (rule) => repository.add(rule),
    update: (rule) => repository.update(rule),
    remove: (id) => repository.remove(id),
    reorder: (ids) => repository.reorder(ids),
    setGlobalEnabled: (enabled) => repository.setGlobalEnabled(enabled),
    exportToFile: async () => {
      const [rules, globalEnabled] = await Promise.all([repository.getAll(), repository.getGlobalEnabled()]);
      download(exportRules({ version: 1, globalEnabled, rules }));
    },
    importFromFile: async (json, mode): Promise<ImportOutcome> => {
      const result = importRules(json);
      if (!result.ok) return { ok: false, error: result.error };
      if (mode === 'merge') {
        const current = await repository.getAll();
        await persist(mergeRules(current, result.state.rules), await repository.getGlobalEnabled());
        return { ok: true };
      }
      await persist(result.state.rules, result.state.globalEnabled);
      return { ok: true };
    },
  };
};
