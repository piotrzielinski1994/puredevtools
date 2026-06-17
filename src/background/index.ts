import browser from 'webextension-polyfill';
import { ChromeEngine } from '../engine/chrome/ChromeEngine';
import { FirefoxEngine } from '../engine/firefox/FirefoxEngine';
import type { DnrApi } from '../engine/chrome/ChromeEngine';
import type { WebRequestApi } from '../engine/firefox/FirefoxEngine';
import type { StreamFilter } from '../engine/firefox/types';
import { RuleRepository } from '../rules/storage';
import type { Message } from '../shared/messages';
import { BackgroundController } from './controller';
import { selectEngine } from './selectEngine';

type FirefoxWebRequest = WebRequestApi & {
  filterResponseData: (requestId: string) => StreamFilter;
};

const firefoxWebRequest = browser.webRequest as unknown as Partial<FirefoxWebRequest>;
const hasFilterResponseData = typeof firefoxWebRequest.filterResponseData === 'function';

const repository = new RuleRepository(browser.storage.local);

const engine = selectEngine({
  hasFilterResponseData,
  chrome: () => new ChromeEngine(browser.declarativeNetRequest as unknown as DnrApi),
  firefox: () => {
    const webRequest = firefoxWebRequest as FirefoxWebRequest;
    return new FirefoxEngine(webRequest, {
      filterResponseData: (requestId: string) => webRequest.filterResponseData(requestId),
      delay: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
  },
});

const controller = new BackgroundController({
  repository,
  engine,
  storageChanges: {
    subscribe: (listener) =>
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        listener(Object.keys(changes));
      }),
  },
  scheduler: {
    schedule: (task) => queueMicrotask(task),
  },
});

browser.runtime.onMessage.addListener((message: unknown) => controller.handleMessage(message as Message));
browser.runtime.onStartup.addListener(() => void controller.reapply());
browser.runtime.onInstalled.addListener(() => void controller.reapply());

void controller.start();
