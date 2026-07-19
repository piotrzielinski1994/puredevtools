import { describe, it, expect } from 'vitest';
import type { Rule } from '../../rules/model';
import { emptyDraft, ruleToDraft, draftToRule, draftsEqual, type RuleDraft, type OpRow } from './ruleDraft';

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'existing rule',
  enabled: true,
  matchers: { url: { pattern: 'https://example.com/*', kind: 'glob' } },
  actions: [],
  ...overrides,
});

const baseDraft = (overrides: Partial<RuleDraft> = {}): RuleDraft => ({
  name: 'alpha',
  pattern: 'https://api.test.dev/*',
  kind: 'glob',
  methods: ['GET'],
  responseOps: [],
  rewriteBody: '',
  ...overrides,
});

describe('emptyDraft', () => {
  it('should return an all-empty glob draft with no methods, ops or body', () => {
    // behavior: the blank projection used to seed a new-rule tab
    expect(emptyDraft()).toEqual({
      name: '',
      pattern: '',
      kind: 'glob',
      methods: [],
      responseOps: [],
      rewriteBody: '',
    });
  });
});

describe('ruleToDraft', () => {
  it('should prefill name, pattern and kind from the rule', () => {
    // behavior: the editable projection mirrors the saved rule's match fields
    const draft = ruleToDraft(
      buildRule({ name: 'prefilled', matchers: { url: { pattern: 'https://prefill.test/*', kind: 'regex' } } }),
    );

    expect(draft.name).toBe('prefilled');
    expect(draft.pattern).toBe('https://prefill.test/*');
    expect(draft.kind).toBe('regex');
  });

  it('should prefill methods from the rule matchers, defaulting to an empty list', () => {
    // behavior: methods carry across; a rule without methods yields []
    expect(ruleToDraft(buildRule({ matchers: { url: { pattern: 'p', kind: 'glob' }, methods: ['GET', 'POST'] } })).methods).toEqual(['GET', 'POST']);
    expect(ruleToDraft(buildRule()).methods).toEqual([]);
  });

  it('should prefill responseOps and rewriteBody from the rule actions', () => {
    // behavior: response header ops and body-rewrite project back into editable rows
    const draft = ruleToDraft(
      buildRule({
        actions: [
          { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }, { op: 'remove', name: 'Set-Cookie' }] },
          { type: 'rewriteBody', body: '{"pre":true}' },
        ],
      }),
    );

    expect(draft.responseOps).toEqual([
      { op: 'set', name: 'X-Env', value: 'staging' },
      { op: 'remove', name: 'Set-Cookie', value: '' },
    ]);
    expect(draft.rewriteBody).toBe('{"pre":true}');
  });

  it('should default responseOps and rewriteBody to empty when the rule has no such actions', () => {
    // behavior: absent actions project to an empty row list and empty body
    const draft = ruleToDraft(buildRule());

    expect(draft.responseOps).toEqual([]);
    expect(draft.rewriteBody).toBe('');
  });
});

describe('draftToRule', () => {
  it('should build a Rule with matchers, methods, header ops and body from a valid draft', () => {
    // behavior: the happy path assembles a full Rule from the editable projection
    const result = draftToRule(
      baseDraft({
        name: 'my rule',
        pattern: 'https://api.test.dev/*',
        kind: 'glob',
        methods: ['GET', 'POST'],
        responseOps: [{ op: 'set', name: 'X-Test', value: 'on' }],
        rewriteBody: 'new-body',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rule.name).toBe('my rule');
    expect(result.rule.matchers.url).toEqual({ pattern: 'https://api.test.dev/*', kind: 'glob' });
    expect(result.rule.matchers.methods).toEqual(['GET', 'POST']);
    expect(result.rule.actions).toContainEqual({ type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Test', value: 'on' }] });
    expect(result.rule.actions).toContainEqual({ type: 'rewriteBody', body: 'new-body' });
  });

  it('should build a remove header op without a value field', () => {
    // behavior: a remove row projects to a { op, name } header op only
    const result = draftToRule(baseDraft({ responseOps: [{ op: 'remove', name: 'Set-Cookie', value: '' }] }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rule.actions).toContainEqual({ type: 'modifyResponseHeaders', headers: [{ op: 'remove', name: 'Set-Cookie' }] });
  });

  it('should omit response-header ops whose name is blank', () => {
    // behavior: empty-name rows are dropped so no zero-name header ships
    const result = draftToRule(baseDraft({ responseOps: [{ op: 'set', name: '  ', value: 'x' }] }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rule.actions.some((action) => action.type === 'modifyResponseHeaders')).toBe(false);
  });

  it('should omit the methods key when the draft has no methods selected', () => {
    // behavior: an empty methods list means "any method" (no methods matcher)
    const result = draftToRule(baseDraft({ methods: [] }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rule.matchers.methods).toBeUndefined();
  });

  it('should omit the rewriteBody action when the body is blank', () => {
    // behavior: an empty body does not produce a rewriteBody action
    const result = draftToRule(baseDraft({ rewriteBody: '' }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rule.actions.some((action) => action.type === 'rewriteBody')).toBe(false);
  });

  it('should fail with an error when the pattern is empty', () => {
    // behavior: an empty URL pattern is invalid and returns the error branch
    const result = draftToRule(baseDraft({ pattern: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toMatch(/pattern/i);
  });

  it('should fail with an error when a regex pattern is invalid', () => {
    // behavior: an uncompilable regex pattern returns the error branch
    const result = draftToRule(baseDraft({ pattern: '[', kind: 'regex' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toMatch(/regular expression|regex/i);
  });

  it('should preserve id and enabled from the baseline rule', () => {
    // behavior: editing keeps the saved rule's identity and enabled flag
    const result = draftToRule(baseDraft({ name: 'renamed' }), buildRule({ id: 'edit-me', enabled: false }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rule.id).toBe('edit-me');
    expect(result.rule.enabled).toBe(false);
    expect(result.rule.name).toBe('renamed');
  });

  it('should mint a fresh id and default enabled to true when there is no baseline', () => {
    // behavior: a brand-new draft gets a generated id and is enabled by default
    const result = draftToRule(baseDraft({ name: 'brand new' }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.rule.id).toMatch(/^rule-/);
    expect(result.rule.enabled).toBe(true);
  });
});

describe('draftsEqual', () => {
  it('should return true for two identical drafts', () => {
    // behavior: an unchanged draft equals its baseline (revert-to-clean)
    expect(draftsEqual(baseDraft(), baseDraft())).toBe(true);
  });

  it('should return false when a scalar field differs', () => {
    // behavior: a changed field (name) reads as not equal (dirty)
    expect(draftsEqual(baseDraft({ name: 'one' }), baseDraft({ name: 'two' }))).toBe(false);
  });

  it('should treat methods as equal regardless of their order', () => {
    // behavior: method toggle order must not read as dirty
    expect(draftsEqual(baseDraft({ methods: ['GET', 'POST'] }), baseDraft({ methods: ['POST', 'GET'] }))).toBe(true);
  });

  it('should treat reordered responseOps as not equal', () => {
    // behavior: response-op row order is user-meaningful, so a reorder is dirty
    const a: OpRow[] = [{ op: 'set', name: 'A', value: '1' }, { op: 'set', name: 'B', value: '2' }];
    const b: OpRow[] = [{ op: 'set', name: 'B', value: '2' }, { op: 'set', name: 'A', value: '1' }];

    expect(draftsEqual(baseDraft({ responseOps: a }), baseDraft({ responseOps: b }))).toBe(false);
  });
});
