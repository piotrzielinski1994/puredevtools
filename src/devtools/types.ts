import type { InterceptReport } from '../engine/page/types';

export type PanelEntry = InterceptReport & { id: number };

export type LogState = { entries: PanelEntry[]; nextId: number };

export type LogAction =
  | { type: 'report'; report: InterceptReport }
  | { type: 'clear' };

export type RelayPort = {
  postMessage(message: PanelReportMessage): void;
  onDisconnect: { addListener(listener: () => void): void };
};

export type PanelConnectMessage = { type: 'panel-init'; tabId: number };

export type PanelReportMessage = { type: 'report'; report: InterceptReport };

export const PANEL_PORT_NAME = 'puredevtools-devtools-panel';

export const REPORT_MESSAGE = 'puredevtools:intercept-report';
