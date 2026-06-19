import type { Capabilities } from '../../engine/RequestEngine';
import type { Rule } from '../../rules/model';

export type ImportOutcome = { ok: true } | { ok: false; error: string };

export type ImportMode = 'replace' | 'merge';

export type UiGateway = {
  getAll(): Promise<Rule[]>;
  getGlobalEnabled(): Promise<boolean>;
  getCapabilities(): Promise<Capabilities>;
  add(rule: Rule): Promise<void>;
  update(rule: Rule): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  setGlobalEnabled(enabled: boolean): Promise<void>;
  exportToFile(): Promise<void>;
  importFromFile(json: string, mode: ImportMode): Promise<ImportOutcome>;
};
