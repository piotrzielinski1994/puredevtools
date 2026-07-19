import { describe, it, expect } from 'vitest';
import { portableSchema, ruleSchema, workspaceSchema } from './schema';

const validRule = {
  id: 'r1',
  name: 'test rule',
  enabled: true,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
};

const ruleNode = (id: string) => ({ kind: 'rule', rule: { ...validRule, id } });

const folderNode = (id: string, children: unknown[] = []) => ({
  kind: 'folder',
  id,
  name: id,
  collapsed: false,
  children,
});

describe('ruleSchema', () => {
  it('should parse a rule without a priority field (AC-011)', () => {
    expect(ruleSchema.safeParse(validRule).success).toBe(true);
  });

  it('should not expose a priority field on the parsed rule (AC-011)', () => {
    const parsed = ruleSchema.parse(validRule);
    expect('priority' in parsed).toBe(false);
  });

  it('should round-trip a rule carrying request-side actions through the schema (TC-001)', () => {
    const rule = {
      ...validRule,
      actions: [
        { type: 'modifyRequestHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] },
        { type: 'rewriteRequestBody', body: '{"q":2}' },
      ],
    };

    expect(ruleSchema.safeParse(rule).success).toBe(true);

    const first = portableSchema.safeParse({ enabled: true, workspace: [{ kind: 'rule', rule }] });
    expect(first.success).toBe(true);
    if (!first.success) throw new Error('expected valid portable state');

    const roundTripped = portableSchema.safeParse(JSON.parse(JSON.stringify(first.data)));
    expect(roundTripped.success).toBe(true);
    if (!roundTripped.success) throw new Error('expected valid round-trip');
    expect(roundTripped.data.workspace).toEqual(first.data.workspace);
  });

  it('should reject a rule action carrying an unknown type (TC-002)', () => {
    const rule = { ...validRule, actions: [{ type: 'bogusAction', foo: 1 }] };
    expect(ruleSchema.safeParse(rule).success).toBe(false);
  });

  it('should parse a rule carrying preScript and postScript actions (AC-001)', () => {
    // behavior: the two new script action variants are accepted by the schema
    const rule = {
      ...validRule,
      actions: [
        { type: 'preScript', source: 'req.setHeader("x", "1");' },
        { type: 'postScript', source: 'res.setBody("changed");' },
      ],
    };

    expect(ruleSchema.safeParse(rule).success).toBe(true);
  });

  it('should round-trip a rule carrying preScript/postScript actions through portable state (AC-001)', () => {
    // behavior: the script sources survive an export -> JSON -> import cycle verbatim
    const rule = {
      ...validRule,
      actions: [
        { type: 'preScript', source: 'req.setUrl("https://api.example.com/v2");' },
        { type: 'postScript', source: 'const j = res.getJson(); res.setBody(JSON.stringify(j));' },
      ],
    };

    const first = portableSchema.safeParse({ enabled: true, workspace: [{ kind: 'rule', rule }] });
    expect(first.success).toBe(true);
    if (!first.success) throw new Error('expected valid portable state');

    const roundTripped = portableSchema.safeParse(JSON.parse(JSON.stringify(first.data)));
    expect(roundTripped.success).toBe(true);
    if (!roundTripped.success) throw new Error('expected valid round-trip');
    expect(roundTripped.data.workspace).toEqual(first.data.workspace);
  });

  it('should reject a preScript action missing its source field (AC-001)', () => {
    // behavior: source is required on a script action
    const rule = { ...validRule, actions: [{ type: 'preScript' }] };
    expect(ruleSchema.safeParse(rule).success).toBe(false);
  });

  it('should still reject an unknown action type after adding the script variants (AC-001, strict)', () => {
    // behavior: .strict() discriminated union rejects any type outside the known set
    const rule = { ...validRule, actions: [{ type: 'sideScript', source: 'x' }] };
    expect(ruleSchema.safeParse(rule).success).toBe(false);
  });
});

describe('workspaceSchema', () => {
  it('should parse a nested tree of folders and rules (AC-001)', () => {
    const tree = [
      folderNode('f', [ruleNode('r1'), folderNode('g', [ruleNode('r2')])]),
      ruleNode('r3'),
    ];
    expect(workspaceSchema.safeParse(tree).success).toBe(true);
  });

  it('should parse an empty workspace', () => {
    expect(workspaceSchema.safeParse([]).success).toBe(true);
  });

  it('should fail a node with an unknown kind', () => {
    expect(workspaceSchema.safeParse([{ kind: 'bogus', id: 'x' }]).success).toBe(false);
  });

  it('should fail a folder node missing its children array', () => {
    expect(
      workspaceSchema.safeParse([{ kind: 'folder', id: 'f', name: 'f', collapsed: false }]).success,
    ).toBe(false);
  });
});

describe('portableSchema', () => {
  it('should parse a valid object with enabled and a workspace tree (AC-012)', () => {
    const state = {
      enabled: true,
      workspace: [folderNode('f', [ruleNode('r1')]), ruleNode('r2')],
    };
    expect(portableSchema.safeParse(state).success).toBe(true);
  });

  it('should fail if the duplicate rule id appears anywhere in the tree (TC-016)', () => {
    const state = {
      enabled: true,
      workspace: [folderNode('f', [ruleNode('dup')]), ruleNode('dup')],
    };
    expect(portableSchema.safeParse(state).success).toBe(false);
  });

  it('should fail if the workspace field is missing', () => {
    expect(portableSchema.safeParse({ enabled: true }).success).toBe(false);
  });
});
