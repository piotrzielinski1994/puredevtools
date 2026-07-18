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
