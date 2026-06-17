export type PatternKind = 'glob' | 'regex';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type ResourceType =
  | 'main_frame'
  | 'sub_frame'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'object'
  | 'xmlhttprequest'
  | 'ping'
  | 'csp_report'
  | 'media'
  | 'websocket'
  | 'other';

export type HeaderMatcher = {
  name: string;
  equals?: string;
  contains?: string;
};

export type Matchers = {
  url: { pattern: string; kind: PatternKind };
  methods?: HttpMethod[];
  resourceTypes?: ResourceType[];
  requestHeaders?: HeaderMatcher[];
};

export type HeaderOp =
  | { op: 'set'; name: string; value: string }
  | { op: 'remove'; name: string };

export type RequestAction =
  | { type: 'modifyRequestHeaders'; headers: HeaderOp[] }
  | { type: 'redirect'; url: string }
  | { type: 'block' };

export type ResponseAction =
  | { type: 'modifyResponseHeaders'; headers: HeaderOp[] }
  | { type: 'setStatus'; status: number }
  | { type: 'rewriteBody'; body: string; contentType?: string };

export type MockAction = {
  type: 'mock';
  status: number;
  headers: HeaderOp[];
  body: string;
  contentType?: string;
  latencyMs?: number;
};

export type RuleAction = RequestAction | ResponseAction | MockAction;

export type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchers: Matchers;
  actions: RuleAction[];
};

export type RequestDescriptor = {
  url: string;
  method: string;
  resourceType: ResourceType;
  requestHeaders?: Record<string, string>;
};
