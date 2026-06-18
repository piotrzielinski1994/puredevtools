import { StrictMode, useEffect, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { emptyLog, reduceLog } from '../../devtools/reportLog';
import type { PanelConnectMessage, PanelReportMessage } from '../../devtools/types';
import { PANEL_PORT_NAME } from '../../devtools/types';
import '../globals.css';
import { InterceptTable } from './InterceptTable';

const isReportMessage = (message: unknown): message is PanelReportMessage =>
  typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'report';

const Panel = () => {
  const [log, dispatch] = useReducer(reduceLog, undefined, emptyLog);

  useEffect(() => {
    const port = browser.runtime.connect({ name: PANEL_PORT_NAME });
    const init: PanelConnectMessage = { type: 'panel-init', tabId: browser.devtools.inspectedWindow.tabId };
    port.postMessage(init);
    const onMessage = (message: unknown): void => {
      if (isReportMessage(message)) dispatch({ type: 'report', report: message.report });
    };
    port.onMessage.addListener(onMessage);
    return () => port.disconnect();
  }, []);

  return <InterceptTable entries={log.entries} onClear={() => dispatch({ type: 'clear' })} />;
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  );
}
