import type { RequestDescriptor, Rule } from '../../rules/model';
import { matchesRequest } from '../../rules/match';
import { firstAction } from '../../rules/action';
import { resolveRewrite } from './rewriteUrl';
import type { Interception } from './types';

const PASSTHROUGH: Interception = { kind: 'passthrough' };

const toInterception = (rule: Rule, descriptor: RequestDescriptor): Interception => {
  const headers = firstAction(rule, 'modifyResponseHeaders');
  const rewrite = firstAction(rule, 'rewriteBody');
  const requestHeaders = firstAction(rule, 'modifyRequestHeaders');
  const requestRewrite = firstAction(rule, 'rewriteRequestBody');
  const requestUrl = firstAction(rule, 'rewriteRequestUrl');
  const preScript = firstAction(rule, 'preScript');
  const postScript = firstAction(rule, 'postScript');
  if (!headers && !rewrite && !requestHeaders && !requestRewrite && !requestUrl && !preScript && !postScript) {
    return PASSTHROUGH;
  }
  return {
    kind: 'override',
    headerOps: headers?.headers ?? [],
    body: rewrite?.body,
    contentType: rewrite?.contentType,
    requestHeaderOps: requestHeaders?.headers ?? [],
    requestBody: requestRewrite?.body,
    requestUrl: requestUrl ? resolveRewrite(descriptor.url, requestUrl.target) : undefined,
    preScript: preScript?.source,
    postScript: postScript?.source,
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
  return match ? toInterception(match, descriptor) : PASSTHROUGH;
};
