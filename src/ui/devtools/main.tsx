import { StrictMode, useEffect, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { emptyLog, reduceLog } from '../../devtools/reportLog';
import type { PanelConnectMessage, PanelReportMessage } from '../../devtools/types';
import { PANEL_PORT_NAME } from '../../devtools/types';
import { useTheme } from '../shared/useTheme';
import '../globals.css';
import { InterceptTable } from './InterceptTable';

const isReportMessage = (message: unknown): message is PanelReportMessage =>
  typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'report';

const inspectedTabId = (): number | undefined => {
  try {
    return browser.devtools?.inspectedWindow?.tabId;
  } catch {
    return undefined;
  }
};

const Panel = () => {
  const [log, dispatch] = useReducer(reduceLog, undefined, emptyLog);
  useTheme();

  useEffect(() => {
    const tabId = inspectedTabId();
    if (tabId === undefined) return undefined;
    const port = browser.runtime.connect({ name: PANEL_PORT_NAME });
    const init: PanelConnectMessage = { type: 'panel-init', tabId };
    port.postMessage(init);
    const onMessage = (message: unknown): void => {
      if (isReportMessage(message)) dispatch({ type: 'report', report: message.report });
    };
    port.onMessage.addListener(onMessage);
    return () => port.disconnect();
  }, []);

  return <InterceptTable entries={log.entries} onClear={() => dispatch({ type: 'clear' })} />;
};

const paintError = (root: HTMLElement, error: unknown): void => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  root.textContent = `ReqHook panel failed to start:\n${message}`;
  root.setAttribute('style', 'white-space:pre-wrap;font-family:monospace;font-size:12px;padding:12px;color:#b91c1c');
};

const root = document.getElementById('root');
if (root) {
  window.addEventListener('error', (event) => paintError(root, event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => paintError(root, event.reason));
  try {
    createRoot(root).render(
      <StrictMode>
        <Panel />
      </StrictMode>,
    );
  } catch (error) {
    paintError(root, error);
  }
}
