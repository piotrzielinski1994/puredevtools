import { describe, it, expect } from 'vitest';
import type { FolderNode, Rule, RuleNode, TreeNode } from './model';
import { STORAGE_KEYS } from '../shared/constants';
import { RuleRepository, type StorageArea } from './storage';

const createFakeStorageArea = (
  initial: Record<string, unknown> = {},
): StorageArea & { backing: Record<string, unknown> } => {
  const backing: Record<string, unknown> = { ...initial };
  return {
    backing,
    get: async (keys: string[]) => {
      const out: Record<string, unknown> = {};
      keys.forEach((key) => {
        if (key in backing) {
          out[key] = backing[key];
        }
      });
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    },
  };
};

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
  ...overrides,
});

const ruleNode = (id: string): RuleNode => ({ kind: 'rule', rule: buildRule({ id }) });

const folder = (id: string, children: TreeNode[] = []): FolderNode => ({
  kind: 'folder',
  id,
  name: id,
  collapsed: false,
  children,
});

const rootIds = (tree: TreeNode[]): string[] =>
  tree.map((node) => (node.kind === 'rule' ? node.rule.id : node.id));

describe('RuleRepository.getWorkspace / saveWorkspace', () => {
  it('should return an empty workspace if storage is empty', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    expect(await repo.getWorkspace()).toEqual([]);
  });

  it('should round-trip a saved workspace tree', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    const tree: TreeNode[] = [folder('f', [ruleNode('r1')]), ruleNode('r2')];
    await repo.saveWorkspace(tree);
    expect(await repo.getWorkspace()).toEqual(tree);
  });
});

describe('RuleRepository.getAll', () => {
  it('should return an empty array if storage is empty', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    expect(await repo.getAll()).toEqual([]);
  });

  it('should return the DFS pre-order flatten of the workspace as ordered rules (AC-006)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    const tree: TreeNode[] = [folder('f', [ruleNode('r1'), ruleNode('r2')]), ruleNode('r3')];
    await repo.saveWorkspace(tree);
    expect((await repo.getAll()).map((rule) => rule.id)).toEqual(['r1', 'r2', 'r3']);
  });
});

describe('RuleRepository back-compat migration', () => {
  it('should wrap a legacy flat Rule[] as rule nodes at root (AC-011)', async () => {
    const legacy = [buildRule({ id: 'a' }), buildRule({ id: 'b' })];
    const repo = new RuleRepository(createFakeStorageArea({ [STORAGE_KEYS.rules]: legacy }));
    const workspace = await repo.getWorkspace();
    expect(rootIds(workspace)).toEqual(['a', 'b']);
    expect(workspace.every((node) => node.kind === 'rule')).toBe(true);
  });

  it('should drop a legacy priority field when wrapping flat rules (AC-011)', async () => {
    const legacy = [{ ...buildRule({ id: 'a' }), priority: 5 }];
    const repo = new RuleRepository(createFakeStorageArea({ [STORAGE_KEYS.rules]: legacy }));
    const workspace = await repo.getWorkspace();
    const node = workspace[0];
    expect(node.kind).toBe('rule');
    expect(node.kind === 'rule' ? 'priority' in node.rule : true).toBe(false);
  });
});

describe('RuleRepository.addRuleNode', () => {
  it('should append a rule node at root and read it back via getWorkspace', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.addRuleNode(buildRule({ id: 'a' }));
    expect(rootIds(await repo.getWorkspace())).toEqual(['a']);
  });

  it('should keep previously added rules when appending another (AC-002)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.addRuleNode(buildRule({ id: 'a' }));
    await repo.addRuleNode(buildRule({ id: 'b' }));
    expect((await repo.getAll()).map((rule) => rule.id)).toEqual(['a', 'b']);
  });
});

describe('RuleRepository.updateRule', () => {
  it('should replace the matching rule by id wherever it sits in the tree', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f', [ruleNode('a')])]);
    await repo.updateRule(buildRule({ id: 'a', name: 'after' }));
    const updated = (await repo.getAll()).find((rule) => rule.id === 'a');
    expect(updated?.name).toBe('after');
  });

  it('should leave other rules unchanged when updating one', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([ruleNode('a'), ruleNode('b')]);
    await repo.updateRule(buildRule({ id: 'a', name: 'changed' }));
    const stored = (await repo.getAll()).find((rule) => rule.id === 'b');
    expect(stored?.name).toBe('test rule');
  });
});

describe('RuleRepository.removeNode', () => {
  it('should drop the node with the given id and keep the others', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([ruleNode('a'), ruleNode('b')]);
    await repo.removeNode('a');
    expect(rootIds(await repo.getWorkspace())).toEqual(['b']);
  });

  it('should remove a folder together with its whole subtree', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f', [ruleNode('r1')]), ruleNode('r2')]);
    await repo.removeNode('f');
    expect(await repo.getAll()).toHaveLength(1);
    expect(rootIds(await repo.getWorkspace())).toEqual(['r2']);
  });
});

describe('RuleRepository.moveNode', () => {
  it('should persist a reorder among root siblings (AC-002)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([ruleNode('r1'), ruleNode('r2'), ruleNode('r3')]);
    await repo.moveNode('r3', { parentId: null, index: 0 });
    expect(rootIds(await repo.getWorkspace())).toEqual(['r3', 'r1', 'r2']);
  });

  it('should persist a move of a rule into a folder (AC-003)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f'), ruleNode('r2')]);
    await repo.moveNode('r2', { parentId: 'f', index: 0 });
    expect((await repo.getAll()).map((rule) => rule.id)).toEqual(['r2']);
    expect(rootIds(await repo.getWorkspace())).toEqual(['f']);
  });
});

describe('RuleRepository.addFolder', () => {
  it('should create a folder at root when parentId is null (AC-007)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.addFolder(null);
    const workspace = await repo.getWorkspace();
    expect(workspace.some((node) => node.kind === 'folder')).toBe(true);
  });

  it('should create a folder inside an existing folder when parentId is given (AC-007)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f')]);
    await repo.addFolder('f');
    const parent = (await repo.getWorkspace()).find((node) => node.kind === 'folder' && node.id === 'f');
    expect(parent?.kind).toBe('folder');
    expect(parent && parent.kind === 'folder' ? parent.children.some((c) => c.kind === 'folder') : false).toBe(true);
  });
});

describe('RuleRepository.duplicateNode', () => {
  it('should persist a folder clone as a sibling right after the source (AC-002)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f', [ruleNode('r1'), ruleNode('r2')])]);

    await repo.duplicateNode('f');

    const workspace = await repo.getWorkspace();
    expect(workspace).toHaveLength(2);
    const [source, clone] = workspace;
    expect(source.kind === 'folder' ? source.name : null).toBe('f');
    expect(clone.kind === 'folder' ? clone.name : null).toBe('f (copy)');
  });

  it('should persist fresh rule ids so the flattened workspace has no duplicate ids (AC-005)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f', [ruleNode('r1'), ruleNode('r2')])]);

    await repo.duplicateNode('f');

    const ids = (await repo.getAll()).map((rule) => rule.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('should leave the stored workspace unchanged if the id is unknown', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f', [ruleNode('r1')])]);
    const before = await repo.getWorkspace();

    await repo.duplicateNode('nope');

    expect(await repo.getWorkspace()).toEqual(before);
  });
});

describe('RuleRepository.renameFolder', () => {
  it('should persist a folder rename (AC-008)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f')]);
    await repo.renameFolder('f', 'Auth');
    const node = (await repo.getWorkspace()).find((n) => n.kind === 'folder' && n.id === 'f');
    expect(node && node.kind === 'folder' ? node.name : null).toBe('Auth');
  });
});

describe('RuleRepository.toggleCollapse', () => {
  it('should persist a collapsed toggle and not change flatten order (AC-010)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([folder('f', [ruleNode('r1')]), ruleNode('r2')]);
    const orderBefore = (await repo.getAll()).map((rule) => rule.id);
    await repo.toggleCollapse('f');
    const node = (await repo.getWorkspace()).find((n) => n.kind === 'folder' && n.id === 'f');
    expect(node && node.kind === 'folder' ? node.collapsed : null).toBe(true);
    expect((await repo.getAll()).map((rule) => rule.id)).toEqual(orderBefore);
  });
});

describe('RuleRepository.getGlobalEnabled', () => {
  it('should default to true when storage is empty (AC-003, edge case)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    expect(await repo.getGlobalEnabled()).toBe(true);
  });

  it('should read back a persisted false value (AC-003)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.setGlobalEnabled(false);
    expect(await repo.getGlobalEnabled()).toBe(false);
  });
});

describe('RuleRepository.setGlobalEnabled', () => {
  it('should persist under the globalEnabled storage key (side-effect-contract)', async () => {
    const area = createFakeStorageArea();
    const repo = new RuleRepository(area);
    await repo.setGlobalEnabled(false);
    expect(area.backing[STORAGE_KEYS.globalEnabled]).toBe(false);
  });

  it('should not touch the stored workspace when toggling the global flag (TC-005)', async () => {
    const repo = new RuleRepository(createFakeStorageArea());
    await repo.saveWorkspace([ruleNode('a'), ruleNode('b')]);
    const before = await repo.getWorkspace();
    await repo.setGlobalEnabled(false);
    expect(await repo.getWorkspace()).toEqual(before);
    expect(await repo.getGlobalEnabled()).toBe(false);
  });
});
