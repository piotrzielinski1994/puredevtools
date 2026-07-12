import { describe, it, expect } from 'vitest';
import type { FolderNode, Rule, RuleNode, TreeNode } from './model';
import type { PortableState } from './schema';
import { exportRules, importRules } from './portable';

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
  ...overrides,
});

const ruleNode = (id: string, overrides: Partial<Rule> = {}): RuleNode => ({
  kind: 'rule',
  rule: buildRule({ id, ...overrides }),
});

const folder = (id: string, children: TreeNode[] = []): FolderNode => ({
  kind: 'folder',
  id,
  name: id,
  collapsed: false,
  children,
});

const buildState = (overrides: Partial<PortableState> = {}): PortableState => ({
  globalEnabled: true,
  workspace: [ruleNode('a'), ruleNode('b')],
  ...overrides,
});

describe('exportRules', () => {
  it('should return a JSON string parseable into the original state (AC-012)', () => {
    const state = buildState();
    const json = exportRules(state);
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toEqual(state);
  });

  it('should serialize the workspace tree (AC-012)', () => {
    const json = exportRules(buildState({ workspace: [folder('f', [ruleNode('r1')])] }));
    expect(JSON.parse(json).workspace[0].kind).toBe('folder');
  });

  it('should serialize the globalEnabled flag (AC-012)', () => {
    const json = exportRules(buildState({ globalEnabled: false }));
    expect(JSON.parse(json).globalEnabled).toBe(false);
  });
});

describe('importRules', () => {
  it('should return ok with the parsed state for a valid workspace (AC-012)', () => {
    const state = buildState();
    const result = importRules(JSON.stringify(state));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(state);
    }
  });

  it('should return an error result without throwing for an invalid JSON string', () => {
    expect(() => importRules('{not json')).not.toThrow();
    const result = importRules('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('should return a validation error for a wrong-shape node', () => {
    const result = importRules('{"globalEnabled":true,"workspace":[{"kind":"rule","rule":{"bad":1}}]}');
    expect(result.ok).toBe(false);
  });

  it('should return a validation error when the workspace field is missing', () => {
    const result = importRules('{"globalEnabled":true}');
    expect(result.ok).toBe(false);
  });

  it('should return a validation error for valid JSON that is not an object', () => {
    expect(importRules('42').ok).toBe(false);
  });

  it('should reject duplicate rule ids anywhere in the tree (TC-016)', () => {
    const state = buildState({ workspace: [folder('f', [ruleNode('dup')]), ruleNode('dup')] });
    const result = importRules(JSON.stringify(state));
    expect(result.ok).toBe(false);
  });
});

describe('export -> import round-trip', () => {
  it('should restore an identical tree with a folder and nested rules (TC-015)', () => {
    const original = buildState({
      globalEnabled: false,
      workspace: [
        folder('f', [
          ruleNode('r1', {
            matchers: { url: { pattern: '^https://api\\.test/', kind: 'regex' }, methods: ['GET', 'POST'] },
            actions: [{ type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] }],
          }),
          folder('g', [ruleNode('r2', { actions: [{ type: 'rewriteBody', body: '{}', contentType: 'application/json' }] })]),
        ]),
        ruleNode('r3'),
      ],
    });
    const result = importRules(exportRules(original));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(original);
    }
  });
});
