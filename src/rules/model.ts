export type PatternKind = 'glob' | 'regex';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type Matchers = {
  url: { pattern: string; kind: PatternKind };
  methods?: HttpMethod[];
};

export type HeaderOp =
  | { op: 'set'; name: string; value: string }
  | { op: 'remove'; name: string };

export type RuleAction =
  | { type: 'modifyResponseHeaders'; headers: HeaderOp[] }
  | { type: 'rewriteBody'; body: string; contentType?: string };

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
};
