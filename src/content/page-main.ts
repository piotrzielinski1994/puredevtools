import type { Rule } from '../rules/model';
import { createPatchedFetch } from '../engine/page/patchFetch';
import { createPatchedXhr } from '../engine/page/patchXhr';
import type { InterceptReport } from '../engine/page/types';
import { REPORT_CHANNEL, isRulesSyncMessage, type ReportChannelMessage } from './channel';

let rules: Rule[] = [];
let globalEnabled = true;

const sink = (report: InterceptReport): void => {
  const label = report.kind === 'mock' ? 'mocked' : 'rewrote';

  console.log(
    `%c[ReqHook]%c ${label} ${report.method} ${report.url} -> ${report.status}`,
    'color:#fff;background:#6d28d9;padding:1px 4px;border-radius:3px',
    'color:inherit',
    report.body,
  );
  const stamped: InterceptReport = { ...report, timestamp: Date.now() };
  const message: ReportChannelMessage = { source: REPORT_CHANNEL, report: stamped };
  window.postMessage(message, window.location.origin);
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

window.fetch = createPatchedFetch({
  originalFetch: window.fetch.bind(window),
  getRules: () => rules,
  getGlobalEnabled: () => globalEnabled,
  sink,
  delay,
});

window.XMLHttpRequest = createPatchedXhr({
  OriginalXhr: window.XMLHttpRequest,
  getRules: () => rules,
  getGlobalEnabled: () => globalEnabled,
  sink,
  delay,
});

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  if (!isRulesSyncMessage(event.data)) return;
  rules = event.data.rules;
  globalEnabled = event.data.globalEnabled;
});
