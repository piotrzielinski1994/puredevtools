import { vi } from 'vitest';
import type { Rule, TreeNode } from '../../rules/model';
import { cloneRule } from '../../rules/clone';
import {
  addFolderNode,
  insertNode,
  moveNode as moveTreeNode,
  newFolderId,
  removeNode as removeTreeNode,
  renameFolder as renameTreeFolder,
  toggleCollapse as toggleTreeCollapse,
  updateRuleInTree,
  type MoveTarget,
} from '../../rules/tree';
import type { ImportOutcome, UiGateway } from './gateway';

export type FakeGateway = {
  [K in keyof UiGateway]: ReturnType<typeof vi.fn>;
} & UiGateway & { workspace(): TreeNode[] };

const ruleNode = (rule: Rule): TreeNode => ({ kind: 'rule', rule });

export const createFakeGateway = (initial: TreeNode[] = [], globalEnabled = true): FakeGateway => {
  let store: TreeNode[] = [...initial];
  let global = globalEnabled;
  const gateway = {
    getWorkspace: vi.fn<() => Promise<TreeNode[]>>(async () => store),
    getGlobalEnabled: vi.fn<() => Promise<boolean>>(async () => global),
    addRule: vi.fn<(rule: Rule) => Promise<void>>(async (rule) => {
      store = insertNode(store, ruleNode(rule), { parentId: null, index: store.length });
    }),
    updateRule: vi.fn<(rule: Rule) => Promise<void>>(async (rule) => {
      store = updateRuleInTree(store, rule);
    }),
    duplicateRule: vi.fn<(rule: Rule, newId: string) => Promise<void>>(async (rule, newId) => {
      store = insertNode(store, ruleNode(cloneRule(rule, newId)), { parentId: null, index: store.length });
    }),
    removeNode: vi.fn<(id: string) => Promise<void>>(async (id) => {
      store = removeTreeNode(store, id).tree;
    }),
    moveNode: vi.fn<(dragId: string, target: MoveTarget) => Promise<void>>(async (dragId, target) => {
      store = moveTreeNode(store, dragId, target);
    }),
    addFolder: vi.fn<(parentId: string | null) => Promise<string>>(async (parentId) => {
      const id = newFolderId(store);
      store = addFolderNode(store, parentId, id);
      return id;
    }),
    renameFolder: vi.fn<(id: string, name: string) => Promise<void>>(async (id, name) => {
      store = renameTreeFolder(store, id, name);
    }),
    toggleCollapse: vi.fn<(id: string) => Promise<void>>(async (id) => {
      store = toggleTreeCollapse(store, id);
    }),
    setGlobalEnabled: vi.fn<(enabled: boolean) => Promise<void>>(async (enabled) => {
      global = enabled;
    }),
    exportToFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    importFromFile: vi.fn<(json: string) => Promise<ImportOutcome>>().mockResolvedValue({ ok: true }),
    workspace: () => store,
  };
  return gateway as unknown as FakeGateway;
};

export const ruleNodes = (rules: Rule[]): TreeNode[] => rules.map(ruleNode);
