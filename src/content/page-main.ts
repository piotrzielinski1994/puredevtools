import { createPatchedFetch } from "../engine/page/patchFetch";
import { createPatchedXhr } from "../engine/page/patchXhr";
import type { InterceptReport } from "../engine/page/types";
import type { Rule } from "../rules/model";
import {
  isRulesSyncMessage,
  REPORT_CHANNEL,
  type ReportChannelMessage,
} from "./channel";

let rules: Rule[] = [];
let globalEnabled = true;

const sink = (report: InterceptReport): void => {
  console.log(
    `%c[puredevtools]%c rewrote ${report.method} ${report.url} -> ${report.status}`,
    "color:#fff;background:#6d28d9;padding:1px 4px;border-radius:3px",
    "color:inherit",
    report.body,
  );
  const stamped: InterceptReport = { ...report, timestamp: Date.now() };
  const message: ReportChannelMessage = {
    source: REPORT_CHANNEL,
    report: stamped,
  };
  window.postMessage(message, window.location.origin);
};

window.fetch = createPatchedFetch({
  originalFetch: window.fetch.bind(window),
  getRules: () => rules,
  getGlobalEnabled: () => globalEnabled,
  sink,
});

window.XMLHttpRequest = createPatchedXhr({
  OriginalXhr: window.XMLHttpRequest,
  getRules: () => rules,
  getGlobalEnabled: () => globalEnabled,
  sink,
});

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (!isRulesSyncMessage(event.data)) return;
  rules = event.data.rules;
  globalEnabled = event.data.globalEnabled;
});
