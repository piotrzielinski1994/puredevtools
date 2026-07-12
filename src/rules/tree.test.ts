import { describe, it, expect } from 'vitest';
import type { Rule } from './model';
import type { FolderNode, RuleNode, TreeNode } from './model';
import {
  containsId,
  findNode,
  flatten,
  insertNode,
  moveNode,
  removeNode,
  renameFolder,
  toggleCollapse,
  walkRuleIds,
} from './tree';

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
  ...overrides,
});

const ruleNode = (rule: Rule): RuleNode => ({ kind: 'rule', rule });

const folder = (
  id: string,
  children: TreeNode[] = [],
  overrides: Partial<Omit<FolderNode, 'kind' | 'id' | 'children'>> = {},
): FolderNode => ({
  kind: 'folder',
  id,
  name: id,
  collapsed: false,
  children,
  ...overrides,
});

const rootIds = (tree: TreeNode[]): string[] =>
  tree.map((node) => (node.kind === 'rule' ? node.rule.id : node.id));

describe('flatten', () => {
  it('should return the DFS pre-order rules if the tree mixes folders and loose rules (TC-007)', () => {
    const r1 = buildRule({ id: 'r1' });
    const r2 = buildRule({ id: 'r2' });
    const r3 = buildRule({ id: 'r3' });
    const tree: TreeNode[] = [folder('f', [ruleNode(r1), ruleNode(r2)]), ruleNode(r3)];
    expect(flatten(tree)).toEqual([r1, r2, r3]);
  });

  it('should recurse into nested folders in pre-order if folders are nested (TC-007)', () => {
    const r1 = buildRule({ id: 'r1' });
    const r2 = buildRule({ id: 'r2' });
    const tree: TreeNode[] = [folder('f', [folder('g', [ruleNode(r1)]), ruleNode(r2)])];
    expect(flatten(tree)).toEqual([r1, r2]);
  });

  it('should still contribute a collapsed folder rules if the folder is collapsed (TC-008)', () => {
    const r1 = buildRule({ id: 'r1' });
    const r2 = buildRule({ id: 'r2' });
    const r3 = buildRule({ id: 'r3' });
    const tree: TreeNode[] = [
      folder('f', [ruleNode(r1), ruleNode(r2)], { collapsed: true }),
      ruleNode(r3),
    ];
    expect(flatten(tree)).toEqual([r1, r2, r3]);
  });

  it('should return an empty array if the workspace is empty', () => {
    expect(flatten([])).toEqual([]);
  });
});

describe('moveNode', () => {
  it('should reorder a node among its siblings if moved within the same parent (TC-001)', () => {
    const tree: TreeNode[] = [
      ruleNode(buildRule({ id: 'r1' })),
      ruleNode(buildRule({ id: 'r2' })),
      ruleNode(buildRule({ id: 'r3' })),
    ];
    const moved = moveNode(tree, 'r3', { parentId: null, index: 0 });
    expect(rootIds(moved)).toEqual(['r3', 'r1', 'r2']);
  });

  it('should move a rule into a folder if the target parent is a folder (TC-002)', () => {
    const tree: TreeNode[] = [folder('f'), ruleNode(buildRule({ id: 'r2' }))];
    const moved = moveNode(tree, 'r2', { parentId: 'f', index: 0 });
    const target = findNode(moved, 'f');
    expect(target?.kind).toBe('folder');
    expect(target && target.kind === 'folder' ? rootIds(target.children) : []).toEqual(['r2']);
    expect(rootIds(moved)).toEqual(['f']);
  });

  it('should move a rule out of a folder back to root if targeted at root (TC-002)', () => {
    const tree: TreeNode[] = [folder('f', [ruleNode(buildRule({ id: 'r2' }))])];
    const moved = moveNode(tree, 'r2', { parentId: null, index: 1 });
    const target = findNode(moved, 'f');
    expect(target && target.kind === 'folder' ? target.children : []).toEqual([]);
    expect(rootIds(moved)).toEqual(['f', 'r2']);
  });

  it('should reorder folders among themselves if a folder is dragged (TC-004)', () => {
    const tree: TreeNode[] = [folder('a'), folder('b')];
    const moved = moveNode(tree, 'b', { parentId: null, index: 0 });
    expect(rootIds(moved)).toEqual(['b', 'a']);
  });

  it('should leave the tree unchanged if a folder is dropped into its own descendant (TC-005)', () => {
    const tree: TreeNode[] = [folder('parent', [folder('child')])];
    const moved = moveNode(tree, 'parent', { parentId: 'child', index: 0 });
    expect(moved).toEqual(tree);
  });

  it('should be a no-op if a folder is dropped onto itself (TC-006)', () => {
    const tree: TreeNode[] = [folder('a'), folder('b')];
    const moved = moveNode(tree, 'a', { parentId: 'a', index: 0 });
    expect(moved).toEqual(tree);
  });

  it('should leave the tree unchanged if a rule is dropped at its own current position (TC-006)', () => {
    const tree: TreeNode[] = [
      ruleNode(buildRule({ id: 'r1' })),
      ruleNode(buildRule({ id: 'r2' })),
    ];
    const moved = moveNode(tree, 'r1', { parentId: null, index: 0 });
    expect(rootIds(moved)).toEqual(['r1', 'r2']);
  });

  it('should leave the tree unchanged if the dragged id is unknown', () => {
    const tree: TreeNode[] = [ruleNode(buildRule({ id: 'r1' }))];
    expect(moveNode(tree, 'missing', { parentId: null, index: 0 })).toEqual(tree);
  });
});

describe('removeNode', () => {
  it('should return the removed node and the tree without it if a rule is removed', () => {
    const tree: TreeNode[] = [
      ruleNode(buildRule({ id: 'r1' })),
      ruleNode(buildRule({ id: 'r2' })),
    ];
    const { tree: without, node } = removeNode(tree, 'r1');
    expect(rootIds(without)).toEqual(['r2']);
    expect(node?.kind).toBe('rule');
    expect(node && node.kind === 'rule' ? node.rule.id : null).toBe('r1');
  });

  it('should remove a folder together with its whole subtree if a folder is removed', () => {
    const tree: TreeNode[] = [
      folder('f', [ruleNode(buildRule({ id: 'r1' }))]),
      ruleNode(buildRule({ id: 'r2' })),
    ];
    const { tree: without, node } = removeNode(tree, 'f');
    expect(rootIds(without)).toEqual(['r2']);
    expect(node?.kind).toBe('folder');
    expect(node && node.kind === 'folder' ? rootIds(node.children) : []).toEqual(['r1']);
  });
});

describe('insertNode', () => {
  it('should insert a node at the given root index if parentId is null', () => {
    const tree: TreeNode[] = [ruleNode(buildRule({ id: 'r1' }))];
    const inserted = insertNode(tree, ruleNode(buildRule({ id: 'r2' })), {
      parentId: null,
      index: 0,
    });
    expect(rootIds(inserted)).toEqual(['r2', 'r1']);
  });

  it('should insert a node inside a folder if parentId targets a folder', () => {
    const tree: TreeNode[] = [folder('f')];
    const inserted = insertNode(tree, ruleNode(buildRule({ id: 'r1' })), {
      parentId: 'f',
      index: 0,
    });
    const target = findNode(inserted, 'f');
    expect(target && target.kind === 'folder' ? rootIds(target.children) : []).toEqual(['r1']);
  });
});

describe('containsId', () => {
  it('should return true for the node own id (self)', () => {
    expect(containsId(folder('parent'), 'parent')).toBe(true);
  });

  it('should return true for any descendant id', () => {
    const node = folder('parent', [folder('child', [ruleNode(buildRule({ id: 'r1' }))])]);
    expect(containsId(node, 'child')).toBe(true);
    expect(containsId(node, 'r1')).toBe(true);
  });

  it('should return false for an unrelated id', () => {
    expect(containsId(folder('parent', [folder('child')]), 'nope')).toBe(false);
  });
});

describe('findNode', () => {
  it('should find a rule node by its rule id', () => {
    const tree: TreeNode[] = [folder('f', [ruleNode(buildRule({ id: 'r1' }))])];
    const found = findNode(tree, 'r1');
    expect(found?.kind).toBe('rule');
    expect(found && found.kind === 'rule' ? found.rule.id : null).toBe('r1');
  });

  it('should find a folder node by its id', () => {
    const tree: TreeNode[] = [folder('f', [folder('g')])];
    const found = findNode(tree, 'g');
    expect(found?.kind).toBe('folder');
  });

  it('should return a falsy value if the id is not present', () => {
    expect(findNode([ruleNode(buildRule({ id: 'r1' }))], 'nope')).toBeFalsy();
  });
});

describe('renameFolder', () => {
  it('should update a folder name if the new name is non-blank (TC-011)', () => {
    const tree: TreeNode[] = [folder('f', [], { name: 'old' })];
    const renamed = renameFolder(tree, 'f', 'API');
    const target = findNode(renamed, 'f');
    expect(target && target.kind === 'folder' ? target.name : null).toBe('API');
  });

  it('should leave the name unchanged if the new name is blank (TC-010)', () => {
    const tree: TreeNode[] = [folder('f', [], { name: 'old' })];
    const renamed = renameFolder(tree, 'f', '   ');
    const target = findNode(renamed, 'f');
    expect(target && target.kind === 'folder' ? target.name : null).toBe('old');
  });
});

describe('toggleCollapse', () => {
  it('should flip a folder collapsed flag from false to true (TC-013)', () => {
    const tree: TreeNode[] = [folder('f', [], { collapsed: false })];
    const toggled = toggleCollapse(tree, 'f');
    const target = findNode(toggled, 'f');
    expect(target && target.kind === 'folder' ? target.collapsed : null).toBe(true);
  });

  it('should flip a folder collapsed flag back from true to false (TC-013)', () => {
    const tree: TreeNode[] = [folder('f', [], { collapsed: true })];
    const toggled = toggleCollapse(tree, 'f');
    const target = findNode(toggled, 'f');
    expect(target && target.kind === 'folder' ? target.collapsed : null).toBe(false);
  });
});

describe('walkRuleIds', () => {
  it('should collect every rule id in the tree including nested ones', () => {
    const tree: TreeNode[] = [
      folder('f', [ruleNode(buildRule({ id: 'r1' })), folder('g', [ruleNode(buildRule({ id: 'r2' }))])]),
      ruleNode(buildRule({ id: 'r3' })),
    ];
    expect([...walkRuleIds(tree)].sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('should return an empty list if the tree has no rules', () => {
    expect(walkRuleIds([folder('f', [folder('g')])])).toEqual([]);
  });
});
