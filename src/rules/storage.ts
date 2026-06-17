import { STORAGE_KEYS } from '../shared/constants';
import type { Rule } from './model';

export type StorageArea = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

const byPriority = (a: Rule, b: Rule): number => a.priority - b.priority;

export class RuleRepository {
  constructor(private readonly area: StorageArea) {}

  async getAll(): Promise<Rule[]> {
    const stored = await this.area.get([STORAGE_KEYS.rules]);
    const rules = stored[STORAGE_KEYS.rules];
    if (!Array.isArray(rules)) return [];
    return [...(rules as Rule[])].sort(byPriority);
  }

  async add(rule: Rule): Promise<void> {
    const rules = await this.getAll();
    await this.persist([...rules, rule]);
  }

  async update(rule: Rule): Promise<void> {
    const rules = await this.getAll();
    await this.persist(rules.map((existing) => (existing.id === rule.id ? rule : existing)));
  }

  async remove(id: string): Promise<void> {
    const rules = await this.getAll();
    await this.persist(rules.filter((rule) => rule.id !== id));
  }

  async reorder(ids: string[]): Promise<void> {
    const rules = await this.getAll();
    const reordered = rules.map((rule) => ({ ...rule, priority: ids.indexOf(rule.id) }));
    await this.persist(reordered);
  }

  async getGlobalEnabled(): Promise<boolean> {
    const stored = await this.area.get([STORAGE_KEYS.globalEnabled]);
    const value = stored[STORAGE_KEYS.globalEnabled];
    return typeof value === 'boolean' ? value : true;
  }

  async setGlobalEnabled(enabled: boolean): Promise<void> {
    await this.area.set({ [STORAGE_KEYS.globalEnabled]: enabled });
  }

  private async persist(rules: Rule[]): Promise<void> {
    await this.area.set({ [STORAGE_KEYS.rules]: rules });
  }
}
