import type { HeaderOp, Rule, RuleAction } from '../../rules/model';
import { encodeDataUrl } from './dataUrl';
import type { DnrAction, DnrCondition, DnrHeaderOperation, DnrRule } from './dnrTypes';

export type TranslationResult = {
  dnrRules: DnrRule[];
  unsupported: string[];
  errors: string[];
};

type ActionOutcome =
  | { kind: 'rule'; action: DnrAction }
  | { kind: 'unsupported'; reason: string };

const toDnrHeaderOp = (op: HeaderOp): DnrHeaderOperation =>
  op.op === 'set'
    ? { header: op.name, operation: 'set', value: op.value }
    : { header: op.name, operation: 'remove' };

const translateAction = (action: RuleAction): ActionOutcome => {
  switch (action.type) {
    case 'modifyRequestHeaders':
      return { kind: 'rule', action: { type: 'modifyHeaders', requestHeaders: action.headers.map(toDnrHeaderOp) } };
    case 'modifyResponseHeaders':
      return { kind: 'rule', action: { type: 'modifyHeaders', responseHeaders: action.headers.map(toDnrHeaderOp) } };
    case 'redirect':
      return { kind: 'rule', action: { type: 'redirect', redirect: { url: action.url } } };
    case 'block':
      return { kind: 'rule', action: { type: 'block' } };
    case 'mock':
      return {
        kind: 'rule',
        action: {
          type: 'redirect',
          redirect: { url: encodeDataUrl({ status: action.status, body: action.body, contentType: action.contentType }) },
        },
      };
    case 'rewriteBody':
      return { kind: 'unsupported', reason: 'rewriteBody' };
    case 'setStatus':
      return { kind: 'unsupported', reason: 'setStatus' };
  }
};

const buildCondition = (rule: Rule): DnrCondition => {
  const { url, methods, resourceTypes } = rule.matchers;
  const condition: DnrCondition = url.kind === 'glob' ? { urlFilter: url.pattern } : { regexFilter: url.pattern };
  if (methods && methods.length > 0) condition.requestMethods = methods.map((method) => method.toLowerCase());
  if (resourceTypes && resourceTypes.length > 0) condition.resourceTypes = [...resourceTypes];
  return condition;
};

const isValidRegex = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

export const translateRules = (rules: Rule[], globalEnabled: boolean): TranslationResult => {
  const dnrRules: DnrRule[] = [];
  const unsupported: string[] = [];
  const errors: string[] = [];
  if (!globalEnabled) return { dnrRules, unsupported, errors };

  rules
    .filter((rule) => rule.enabled)
    .forEach((rule) => {
      if (rule.matchers.url.kind === 'regex' && !isValidRegex(rule.matchers.url.pattern)) {
        errors.push(`Rule "${rule.id}" has an invalid regex pattern: ${rule.matchers.url.pattern}`);
        return;
      }
      const condition = buildCondition(rule);
      rule.actions.forEach((action) => {
        const outcome = translateAction(action);
        if (outcome.kind === 'unsupported') {
          unsupported.push(outcome.reason);
          return;
        }
        if (action.type === 'mock') {
          if (action.latencyMs !== undefined) unsupported.push('latency');
          if (action.status !== 200) unsupported.push('mockStatus');
          if (action.headers.length > 0) unsupported.push('mockHeaders');
        }
        dnrRules.push({ id: dnrRules.length + 1, priority: rule.priority + 1, action: outcome.action, condition });
      });
    });

  return { dnrRules, unsupported, errors };
};
