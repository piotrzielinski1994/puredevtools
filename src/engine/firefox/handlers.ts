import type { HeaderOp, Rule, RuleAction, RequestDescriptor } from '../../rules/model';
import { matchesRequest } from '../../rules/match';
import { encodeDataUrl } from '../chrome/dataUrl';
import { attachBodyRewrite } from './filter';
import type {
  BeforeRequestDetails,
  BeforeSendHeadersDetails,
  BlockingResponse,
  BlockingResult,
  HeadersReceivedDetails,
  HandlerDeps,
  WebRequestHeader,
} from './types';

type RequestLike = {
  url: string;
  method: string;
  type: RequestDescriptor['resourceType'];
  requestHeaders?: WebRequestHeader[];
};

const toDescriptor = (details: RequestLike): RequestDescriptor => ({
  url: details.url,
  method: details.method,
  resourceType: details.type,
  requestHeaders: Object.fromEntries(
    (details.requestHeaders ?? []).map((header) => [header.name, header.value ?? '']),
  ),
});

const findMatchingRule = (rules: Rule[], details: RequestLike): Rule | undefined => {
  const descriptor = toDescriptor(details);
  return rules
    .filter((rule) => rule.enabled)
    .find((rule) => {
      const result = matchesRequest(rule, descriptor);
      return result.ok && result.matched;
    });
};

const applyHeaderOps = (headers: WebRequestHeader[], ops: HeaderOp[]): WebRequestHeader[] =>
  ops.reduce<WebRequestHeader[]>((current, op) => {
    const others = current.filter((header) => header.name.toLowerCase() !== op.name.toLowerCase());
    return op.op === 'set' ? [...others, { name: op.name, value: op.value }] : others;
  }, headers);

const firstAction = <T extends RuleAction>(rule: Rule, type: T['type']): T | undefined =>
  rule.actions.find((action): action is T => action.type === type);

export const buildBeforeSendHeaders =
  (rules: Rule[]) =>
  (details: BeforeSendHeadersDetails): BlockingResponse | undefined => {
    const rule = findMatchingRule(rules, details);
    if (!rule) return undefined;
    const action = firstAction<Extract<RuleAction, { type: 'modifyRequestHeaders' }>>(rule, 'modifyRequestHeaders');
    if (!action) return undefined;
    return { requestHeaders: applyHeaderOps(details.requestHeaders ?? [], action.headers) };
  };

export const buildBeforeRequest =
  (rules: Rule[], deps: HandlerDeps) =>
  (details: BeforeRequestDetails): BlockingResult => {
    const rule = findMatchingRule(rules, details);
    if (!rule) return undefined;
    if (firstAction(rule, 'block')) return { cancel: true };
    const redirect = firstAction<Extract<RuleAction, { type: 'redirect' }>>(rule, 'redirect');
    if (redirect) return { redirectUrl: redirect.url };
    const mock = firstAction<Extract<RuleAction, { type: 'mock' }>>(rule, 'mock');
    if (mock) {
      const response = {
        redirectUrl: encodeDataUrl({ status: mock.status, body: mock.body, contentType: mock.contentType }),
      };
      return mock.latencyMs ? deps.delay(mock.latencyMs).then(() => response) : response;
    }
    const rewrite = firstAction<Extract<RuleAction, { type: 'rewriteBody' }>>(rule, 'rewriteBody');
    if (rewrite) {
      attachBodyRewrite(deps.filterResponseData(details.requestId), rewrite.body);
      return undefined;
    }
    return undefined;
  };

export const buildHeadersReceived =
  (rules: Rule[], _deps: HandlerDeps) =>
  (details: HeadersReceivedDetails): BlockingResponse | undefined => {
    const rule = findMatchingRule(rules, details);
    if (!rule) return undefined;
    const headerAction = firstAction<Extract<RuleAction, { type: 'modifyResponseHeaders' }>>(rule, 'modifyResponseHeaders');
    const statusAction = firstAction<Extract<RuleAction, { type: 'setStatus' }>>(rule, 'setStatus');
    if (!headerAction && !statusAction) return undefined;

    const response: BlockingResponse = {};
    if (headerAction) response.responseHeaders = applyHeaderOps(details.responseHeaders ?? [], headerAction.headers);
    if (statusAction) response.statusLine = `HTTP/1.1 ${statusAction.status}`;
    return response;
  };
