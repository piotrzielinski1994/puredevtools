import type { InterceptReport } from "../engine/page/types";
import type { Rule } from "../rules/model";

export const RULES_CHANNEL = "puredevtools:rules-sync";
export const REPORT_CHANNEL = "puredevtools:intercept-report";

export type RulesSyncMessage = {
  source: typeof RULES_CHANNEL;
  rules: Rule[];
  globalEnabled: boolean;
};

export type ReportChannelMessage = {
  source: typeof REPORT_CHANNEL;
  report: InterceptReport;
};

export const isRulesSyncMessage = (data: unknown): data is RulesSyncMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as { source?: unknown }).source === RULES_CHANNEL &&
  Array.isArray((data as { rules?: unknown }).rules);

export const isReportChannelMessage = (
  data: unknown,
): data is ReportChannelMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as { source?: unknown }).source === REPORT_CHANNEL &&
  typeof (data as { report?: unknown }).report === "object" &&
  (data as { report?: unknown }).report !== null;
