import type { HeaderOp, Rule, RuleAction, RequestDescriptor } from '../../rules/model';
import { matchesRequest } from '../../rules/match';
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
      attachBodyRewrite(deps.filterResponseData(details.requestId), mock.body, mock.latencyMs, deps.delay);
      return undefined;
    }
    const rewrite = firstAction<Extract<RuleAction, { type: 'rewriteBody' }>>(rule, 'rewriteBody');
    if (rewrite) {
      attachBodyRewrite(deps.filterResponseData(details.requestId), rewrite.body);
      return undefined;
    }
    return undefined;
  };

export const buildHeadersReceived =
  (rules: Rule[], deps: HandlerDeps) =>
  (details: HeadersReceivedDetails): BlockingResponse | undefined => {
    const rule = findMatchingRule(rules, details);
    if (!rule) return undefined;
    const mock = firstAction<Extract<RuleAction, { type: 'mock' }>>(rule, 'mock');
    if (mock) {
      reportInterception(deps, details, { kind: 'mock', status: mock.status, body: mock.body, contentType: mock.contentType });
      return mockResponse(mock);
    }

    const rewrite = firstAction<Extract<RuleAction, { type: 'rewriteBody' }>>(rule, 'rewriteBody');
    if (rewrite) {
      reportInterception(deps, details, { kind: 'rewrite', status: details.statusCode, body: rewrite.body, contentType: rewrite.contentType });
    }

    const headerAction = firstAction<Extract<RuleAction, { type: 'modifyResponseHeaders' }>>(rule, 'modifyResponseHeaders');
    const statusAction = firstAction<Extract<RuleAction, { type: 'setStatus' }>>(rule, 'setStatus');
    if (!headerAction && !statusAction) return undefined;

    const response: BlockingResponse = {};
    if (headerAction) response.responseHeaders = applyHeaderOps(details.responseHeaders ?? [], headerAction.headers);
    if (statusAction) response.statusLine = `HTTP/1.1 ${statusAction.status}`;
    return response;
  };

const reportInterception = (
  deps: HandlerDeps,
  details: HeadersReceivedDetails,
  intercepted: { kind: 'mock' | 'rewrite'; status: number; body: string; contentType?: string },
): void => {
  if (!deps.report) return;
  if (details.type === 'xmlhttprequest') return;
  const tabId = details.tabId;
  if (tabId === undefined || tabId < 0) return;
  deps.report(tabId, {
    kind: intercepted.kind,
    method: details.method,
    url: details.url,
    status: intercepted.status,
    body: intercepted.body,
    contentType: intercepted.contentType,
    timestamp: deps.now?.(),
  });
};

const mockResponse = (mock: Extract<RuleAction, { type: 'mock' }>): BlockingResponse => {
  const baseHeaders: WebRequestHeader[] = mock.contentType
    ? [{ name: 'Content-Type', value: mock.contentType }]
    : [];
  return {
    statusLine: `HTTP/1.1 ${mock.status}`,
    responseHeaders: applyHeaderOps(baseHeaders, mock.headers),
  };
};
