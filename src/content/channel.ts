import type { Rule } from '../rules/model';

export const RULES_CHANNEL = 'reqhook:rules-sync';

export type RulesSyncMessage = {
  source: typeof RULES_CHANNEL;
  rules: Rule[];
  globalEnabled: boolean;
};

export const isRulesSyncMessage = (data: unknown): data is RulesSyncMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { source?: unknown }).source === RULES_CHANNEL &&
  Array.isArray((data as { rules?: unknown }).rules);
