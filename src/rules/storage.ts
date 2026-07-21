import { STORAGE_KEYS } from '../shared/constants';
import type { Rule, TreeNode } from './model';
import {
  addFolderNode,
  duplicateNode as duplicateTreeNode,
  flatten,
  insertNode,
  moveNode as moveTreeNode,
  newFolderId,
  removeNode as removeTreeNode,
  renameFolder as renameTreeFolder,
  toggleCollapse as toggleTreeCollapse,
  updateRuleInTree,
  type MoveTarget,
} from './tree';

export type StorageArea = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

const isRuleNode = (value: unknown): value is TreeNode =>
  typeof value === 'object' && value !== null && 'kind' in value;

const stripPriority = (rule: Record<string, unknown>): Rule => {
  const rest = { ...rule };
  delete rest.priority;
  return rest as unknown as Rule;
};

const migrateLegacy = (rules: unknown[]): TreeNode[] =>
  rules.map((rule) => ({ kind: 'rule', rule: stripPriority(rule as Record<string, unknown>) }));

export class RuleRepository {
  constructor(private readonly area: StorageArea) {}

  async getWorkspace(): Promise<TreeNode[]> {
    const stored = await this.area.get([STORAGE_KEYS.rules]);
    const value = stored[STORAGE_KEYS.rules];
    if (!Array.isArray(value)) return [];
    if (value.length === 0) return [];
    if (value.every((entry) => isRuleNode(entry))) return value as TreeNode[];
    return migrateLegacy(value);
  }

  async getAll(): Promise<Rule[]> {
    return flatten(await this.getWorkspace());
  }

  async saveWorkspace(tree: TreeNode[]): Promise<void> {
    await this.persist(tree);
  }

  async addRuleNode(rule: Rule): Promise<void> {
    const tree = await this.getWorkspace();
    await this.persist(insertNode(tree, { kind: 'rule', rule }, { parentId: null, index: tree.length }));
  }

  async updateRule(rule: Rule): Promise<void> {
    const tree = await this.getWorkspace();
    await this.persist(updateRuleInTree(tree, rule));
  }

  async removeNode(id: string): Promise<void> {
    const tree = await this.getWorkspace();
    await this.persist(removeTreeNode(tree, id).tree);
  }

  async duplicateNode(id: string): Promise<void> {
    const tree = await this.getWorkspace();
    await this.persist(duplicateTreeNode(tree, id));
  }

  async moveNode(dragId: string, target: MoveTarget): Promise<void> {
    const tree = await this.getWorkspace();
    await this.persist(moveTreeNode(tree, dragId, target));
  }

  async addFolder(parentId: string | null): Promise<string> {
    const tree = await this.getWorkspace();
    const id = newFolderId(tree);
    await this.persist(addFolderNode(tree, parentId, id));
    return id;
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const tree = await this.getWorkspace();
    await this.persist(renameTreeFolder(tree, id, name));
  }

  async toggleCollapse(id: string): Promise<void> {
    const tree = await this.getWorkspace();
    await this.persist(toggleTreeCollapse(tree, id));
  }

  async getGlobalEnabled(): Promise<boolean> {
    const stored = await this.area.get([STORAGE_KEYS.globalEnabled]);
    const value = stored[STORAGE_KEYS.globalEnabled];
    return typeof value === 'boolean' ? value : true;
  }

  async setGlobalEnabled(enabled: boolean): Promise<void> {
    await this.area.set({ [STORAGE_KEYS.globalEnabled]: enabled });
  }

  async replaceAll(tree: TreeNode[]): Promise<void> {
    await this.persist(tree);
  }

  private async persist(tree: TreeNode[]): Promise<void> {
    await this.area.set({ [STORAGE_KEYS.rules]: tree });
  }
}
