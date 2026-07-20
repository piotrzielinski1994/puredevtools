import type { HeaderOp, HttpMethod, PatternKind, Rule, RuleAction } from '../../rules/model';
import { firstAction } from '../../rules/action';

export type OpRow = { op: 'set' | 'remove'; name: string; value: string };

export type RuleDraft = {
  name: string;
  pattern: string;
  kind: PatternKind;
  methods: HttpMethod[];
  responseOps: OpRow[];
  rewriteBody: string;
  requestOps: OpRow[];
  requestBody: string;
  requestUrl: string;
  preScript: string;
  postScript: string;
};

export type DraftToRuleResult = { ok: true; rule: Rule } | { ok: false; error: string };

const makeId = (seed: string): string => `rule-${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${seed.length}`;

const opToRow = (op: HeaderOp): OpRow =>
  op.op === 'set' ? { op: 'set', name: op.name, value: op.value } : { op: 'remove', name: op.name, value: '' };

const rowToOp = (row: OpRow): HeaderOp =>
  row.op === 'set' ? { op: 'set', name: row.name, value: row.value } : { op: 'remove', name: row.name };

const isValidRegex = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

export const emptyDraft = (): RuleDraft => ({
  name: '',
  pattern: '',
  kind: 'glob',
  methods: [],
  responseOps: [],
  rewriteBody: '',
  requestOps: [],
  requestBody: '',
  requestUrl: '',
  preScript: '',
  postScript: '',
});

export const ruleToDraft = (rule: Rule): RuleDraft => ({
  name: rule.name,
  pattern: rule.matchers.url.pattern,
  kind: rule.matchers.url.kind,
  methods: rule.matchers.methods ?? [],
  responseOps: (firstAction(rule, 'modifyResponseHeaders')?.headers ?? []).map(opToRow),
  rewriteBody: firstAction(rule, 'rewriteBody')?.body ?? '',
  requestOps: (firstAction(rule, 'modifyRequestHeaders')?.headers ?? []).map(opToRow),
  requestBody: firstAction(rule, 'rewriteRequestBody')?.body ?? '',
  requestUrl: firstAction(rule, 'rewriteRequestUrl')?.target ?? '',
  preScript: firstAction(rule, 'preScript')?.source ?? '',
  postScript: firstAction(rule, 'postScript')?.source ?? '',
});

const buildActions = (draft: RuleDraft): RuleAction[] => {
  const respOps = draft.responseOps.filter((row) => row.name.trim() !== '').map(rowToOp);
  const reqOps = draft.requestOps.filter((row) => row.name.trim() !== '').map(rowToOp);
  const actions: RuleAction[] = [];
  if (respOps.length > 0) actions.push({ type: 'modifyResponseHeaders', headers: respOps });
  if (draft.rewriteBody.trim() !== '') actions.push({ type: 'rewriteBody', body: draft.rewriteBody });
  if (reqOps.length > 0) actions.push({ type: 'modifyRequestHeaders', headers: reqOps });
  if (draft.requestBody.trim() !== '') actions.push({ type: 'rewriteRequestBody', body: draft.requestBody });
  if (draft.requestUrl.trim() !== '') actions.push({ type: 'rewriteRequestUrl', target: draft.requestUrl });
  if (draft.preScript.trim() !== '') actions.push({ type: 'preScript', source: draft.preScript });
  if (draft.postScript.trim() !== '') actions.push({ type: 'postScript', source: draft.postScript });
  return actions;
};

export const draftToRule = (draft: RuleDraft, baseline?: Rule): DraftToRuleResult => {
  if (draft.pattern.trim() === '') return { ok: false, error: 'URL pattern is required.' };
  if (draft.kind === 'regex' && !isValidRegex(draft.pattern)) return { ok: false, error: 'Invalid regular expression.' };

  const name = draft.name || draft.pattern;
  return {
    ok: true,
    rule: {
      id: baseline?.id ?? makeId(name),
      name,
      enabled: baseline?.enabled ?? true,
      matchers: {
        url: { pattern: draft.pattern, kind: draft.kind },
        ...(draft.methods.length > 0 ? { methods: draft.methods } : {}),
      },
      actions: buildActions(draft),
    },
  };
};

const methodsEqual = (a: HttpMethod[], b: HttpMethod[]): boolean =>
  a.length === b.length && a.every((method) => b.includes(method));

const opsEqual = (a: OpRow[], b: OpRow[]): boolean =>
  a.length === b.length &&
  a.every((row, index) => row.op === b[index].op && row.name === b[index].name && row.value === b[index].value);

export const draftsEqual = (a: RuleDraft, b: RuleDraft): boolean =>
  a.name === b.name &&
  a.pattern === b.pattern &&
  a.kind === b.kind &&
  a.rewriteBody === b.rewriteBody &&
  a.requestBody === b.requestBody &&
  a.requestUrl === b.requestUrl &&
  a.preScript === b.preScript &&
  a.postScript === b.postScript &&
  methodsEqual(a.methods, b.methods) &&
  opsEqual(a.responseOps, b.responseOps) &&
  opsEqual(a.requestOps, b.requestOps);
