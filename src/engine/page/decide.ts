import type { RequestDescriptor, Rule } from '../../rules/model';
import { matchesRequest } from '../../rules/match';
import { firstAction } from '../../rules/action';
import type { Interception } from './types';

const PASSTHROUGH: Interception = { kind: 'passthrough' };

const toInterception = (rule: Rule): Interception => {
  const headers = firstAction(rule, 'modifyResponseHeaders');
  const rewrite = firstAction(rule, 'rewriteBody');
  if (!headers && !rewrite) return PASSTHROUGH;
  return {
    kind: 'override',
    headerOps: headers?.headers ?? [],
    body: rewrite?.body,
    contentType: rewrite?.contentType,
  };
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
