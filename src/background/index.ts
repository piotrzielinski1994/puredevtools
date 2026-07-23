import browser, { type Runtime } from "webextension-polyfill";
import { ReportRelay } from "../devtools/relay";
import type { PanelConnectMessage, RelayPort } from "../devtools/types";
import { PANEL_PORT_NAME, REPORT_MESSAGE } from "../devtools/types";
import type { InterceptReport } from "../engine/page/types";

const relay = new ReportRelay();

type ReportEnvelope = { type: typeof REPORT_MESSAGE; report: InterceptReport };

const isReportEnvelope = (message: unknown): message is ReportEnvelope =>
  typeof message === "object" &&
  message !== null &&
  (message as { type?: unknown }).type === REPORT_MESSAGE;

browser.runtime.onMessage.addListener(
  (message: unknown, sender: Runtime.MessageSender) => {
    if (!isReportEnvelope(message)) return;
    const tabId = sender.tab?.id;
    if (tabId !== undefined) relay.dispatch(tabId, message.report);
  },
);

const isPanelInit = (message: unknown): message is PanelConnectMessage =>
  typeof message === "object" &&
  message !== null &&
  (message as { type?: unknown }).type === "panel-init";

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT_NAME) return;
  const onInit = (message: unknown): void => {
    if (!isPanelInit(message)) return;
    relay.register(message.tabId, port as unknown as RelayPort);
    port.onMessage.removeListener(onInit);
  };
  port.onMessage.addListener(onInit);
});

browser.tabs.onRemoved.addListener((tabId) => relay.unregister(tabId));
