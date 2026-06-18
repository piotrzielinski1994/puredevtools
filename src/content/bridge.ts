import browser from 'webextension-polyfill';
import { RuleRepository } from '../rules/storage';
import { STORAGE_KEYS } from '../shared/constants';
import { RULES_CHANNEL, type RulesSyncMessage } from './channel';

const repository = new RuleRepository(browser.storage.local);

const push = async (): Promise<void> => {
  const [rules, globalEnabled] = await Promise.all([
    repository.getAll(),
    repository.getGlobalEnabled(),
  ]);
  const message: RulesSyncMessage = { source: RULES_CHANNEL, rules, globalEnabled };
  window.postMessage(message, window.location.origin);
};

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const owned: string[] = [STORAGE_KEYS.rules, STORAGE_KEYS.globalEnabled];
  if (!Object.keys(changes).some((key) => owned.includes(key))) return;
  void push();
});

void push();
