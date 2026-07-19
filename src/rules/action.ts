import type { Rule, RuleAction } from './model';

export const firstAction = <T extends RuleAction['type']>(
  rule: Rule,
  type: T,
): Extract<RuleAction, { type: T }> | undefined =>
  rule.actions.find((action): action is Extract<RuleAction, { type: T }> => action.type === type);
