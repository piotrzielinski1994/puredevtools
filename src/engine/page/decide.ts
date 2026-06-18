import type { RequestDescriptor, Rule, RuleAction } from '../../rules/model';
import { matchesRequest } from '../../rules/match';
import type { Interception } from './types';

const PASSTHROUGH: Interception = { kind: 'passthrough' };

const firstAction = <T extends RuleAction['type']>(rule: Rule, type: T): Extract<RuleAction, { type: T }> | undefined =>
  rule.actions.find((action): action is Extract<RuleAction, { type: T }> => action.type === type);

const toInterception = (rule: Rule): Interception => {
  const mock = firstAction(rule, 'mock');
  if (mock) {
    return {
      kind: 'mock',
      status: mock.status,
      body: mock.body,
      contentType: mock.contentType,
      headers: mock.headers,
      latencyMs: mock.latencyMs,
    };
  }
  const rewrite = firstAction(rule, 'rewriteBody');
  if (rewrite) return { kind: 'rewrite', body: rewrite.body, contentType: rewrite.contentType };
  return PASSTHROUGH;
};

export const decideInterception = (
  rules: Rule[],
  descriptor: RequestDescriptor,
  globalEnabled: boolean,
): Interception => {
  if (!globalEnabled) return PASSTHROUGH;
  const match = rules
    .filter((rule) => rule.enabled)
    .find((rule) => {
      const result = matchesRequest(rule, descriptor);
      return result.ok && result.matched;
    });
  return match ? toInterception(match) : PASSTHROUGH;
};
