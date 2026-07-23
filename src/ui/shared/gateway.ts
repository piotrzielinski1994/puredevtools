import type { Rule, TreeNode } from "../../rules/model";
import type { MoveTarget } from "../../rules/tree";

export type ImportOutcome = { ok: true } | { ok: false; error: string };

export type ImportMode = "replace" | "merge";

export type UiGateway = {
  getWorkspace(): Promise<TreeNode[]>;
  getGlobalEnabled(): Promise<boolean>;
  addRule(rule: Rule): Promise<void>;
  updateRule(rule: Rule): Promise<void>;
  duplicateRule(rule: Rule, newId: string): Promise<void>;
  duplicateNode(id: string): Promise<void>;
  removeNode(id: string): Promise<void>;
  moveNode(dragId: string, target: MoveTarget): Promise<void>;
  addFolder(parentId: string | null): Promise<string>;
  renameFolder(id: string, name: string): Promise<void>;
  toggleCollapse(id: string): Promise<void>;
  setGlobalEnabled(enabled: boolean): Promise<void>;
  exportToFile(): Promise<void>;
  importFromFile(json: string, mode: ImportMode): Promise<ImportOutcome>;
};
