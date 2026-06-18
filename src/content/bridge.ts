import browser from 'webextension-polyfill';
import { RuleRepository } from '../rules/storage';
import { STORAGE_KEYS } from '../shared/constants';
import { REPORT_MESSAGE } from '../devtools/types';
import { RULES_CHANNEL, isReportChannelMessage, type RulesSyncMessage } from './channel';

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

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  if (!isReportChannelMessage(event.data)) return;
  void browser.runtime.sendMessage({ type: REPORT_MESSAGE, report: event.data.report });
});

void push();
