import browser, { type Runtime } from 'webextension-polyfill';
import { ChromeEngine } from '../engine/chrome/ChromeEngine';
import { FirefoxEngine } from '../engine/firefox/FirefoxEngine';
import type { DnrApi } from '../engine/chrome/ChromeEngine';
import type { WebRequestApi } from '../engine/firefox/FirefoxEngine';
import type { StreamFilter } from '../engine/firefox/types';
import type { InterceptReport } from '../engine/page/types';
import { ReportRelay } from '../devtools/relay';
import type { PanelConnectMessage, RelayPort } from '../devtools/types';
import { PANEL_PORT_NAME, REPORT_MESSAGE } from '../devtools/types';
import { RuleRepository } from '../rules/storage';
import type { Message } from '../shared/messages';
import { BackgroundController } from './controller';
import { selectEngine } from './selectEngine';

type FirefoxWebRequest = WebRequestApi & {
  filterResponseData: (requestId: string) => StreamFilter;
};

const nativeWebRequest = (globalThis as unknown as {
  browser?: { webRequest?: Partial<FirefoxWebRequest> };
}).browser?.webRequest;

const nativeFilterResponseData = nativeWebRequest?.filterResponseData?.bind(nativeWebRequest);
const hasFilterResponseData = typeof nativeFilterResponseData === 'function';

const firefoxWebRequest = browser.webRequest as unknown as Partial<FirefoxWebRequest>;

const repository = new RuleRepository(browser.storage.local);

const engine = selectEngine({
  hasFilterResponseData,
  chrome: () => new ChromeEngine(browser.declarativeNetRequest as unknown as DnrApi),
  firefox: () => {
    const webRequest = firefoxWebRequest as FirefoxWebRequest;
    const filterResponseData = nativeFilterResponseData ?? ((requestId: string) => webRequest.filterResponseData(requestId));
    return new FirefoxEngine(webRequest, {
      filterResponseData,
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

const relay = new ReportRelay();

type ReportEnvelope = { type: typeof REPORT_MESSAGE; report: InterceptReport };

const isReportEnvelope = (message: unknown): message is ReportEnvelope =>
  typeof message === 'object' && message !== null && (message as { type?: unknown }).type === REPORT_MESSAGE;

browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  if (isReportEnvelope(message)) {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) relay.dispatch(tabId, message.report);
    return undefined;
  }
  return controller.handleMessage(message as Message);
});

const isPanelInit = (message: unknown): message is PanelConnectMessage =>
  typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'panel-init';

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT_NAME) return;
  const onInit = (message: unknown): void => {
    if (!isPanelInit(message)) return;
    relay.register(message.tabId, port as unknown as RelayPort);
    port.onMessage.removeListener(onInit);
  };
  port.onMessage.addListener(onInit);
});

browser.runtime.onStartup.addListener(() => void controller.reapply());
browser.runtime.onInstalled.addListener(() => void controller.reapply());

void controller.start();
