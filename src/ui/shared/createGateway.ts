import browser from 'webextension-polyfill';
import type { Capabilities } from '../../engine/RequestEngine';
import type { Rule } from '../../rules/model';
import { exportRules, importRules } from '../../rules/portable';
import { RuleRepository } from '../../rules/storage';
import type { Message, MessageResponse } from '../../shared/messages';
import type { ImportOutcome, UiGateway } from './gateway';

const DISABLED_CAPABILITIES: Capabilities = { responseBodyRewrite: false, artificialLatency: false };

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

  const persist = async (importedRules: Rule[], globalEnabled: boolean) => {
    const current = await repository.getAll();
    await Promise.all(current.map((rule) => repository.remove(rule.id)));
    await importedRules.reduce(async (chain, rule) => {
      await chain;
      await repository.add(rule);
    }, Promise.resolve());
    await repository.setGlobalEnabled(globalEnabled);
  };

  return {
    getAll: () => repository.getAll(),
    getGlobalEnabled: () => repository.getGlobalEnabled(),
    getCapabilities: async (): Promise<Capabilities> => {
      const response = (await browser.runtime.sendMessage({ type: 'getCapabilities' } satisfies Message)) as MessageResponse;
      return response.ok && response.type === 'capabilities' ? response.capabilities : DISABLED_CAPABILITIES;
    },
    add: (rule) => repository.add(rule),
    update: (rule) => repository.update(rule),
    remove: (id) => repository.remove(id),
    reorder: (ids) => repository.reorder(ids),
    setGlobalEnabled: (enabled) => repository.setGlobalEnabled(enabled),
    exportToFile: async () => {
      const [rules, globalEnabled] = await Promise.all([repository.getAll(), repository.getGlobalEnabled()]);
      download(exportRules({ version: 1, globalEnabled, rules }));
    },
    importFromFile: async (json): Promise<ImportOutcome> => {
      const result = importRules(json);
      if (!result.ok) return { ok: false, error: result.error };
      await persist(result.state.rules, result.state.globalEnabled);
      return { ok: true };
    },
  };
};
