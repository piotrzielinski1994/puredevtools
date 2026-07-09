import type { Rule } from '../../rules/model';
import type { ApplyDiagnostics, Capabilities, RequestEngine } from '../RequestEngine';
import type { DnrRule } from './dnrTypes';
import { translateRules } from './translateToDnr';

export type DnrApi = {
  getDynamicRules(): Promise<{ id: number }[]>;
  updateDynamicRules(update: { addRules: DnrRule[]; removeRuleIds: number[] }): Promise<void>;
};

export class ChromeEngine implements RequestEngine {
  private lastDiagnostics: ApplyDiagnostics = { errors: [], unsupported: [] };

  constructor(private readonly dnr: DnrApi) {}

  capabilities(): Capabilities {
    return { responseBodyRewrite: false, artificialLatency: false };
  }

  async apply(rules: Rule[], globalEnabled: boolean): Promise<void> {
    const { dnrRules, errors, unsupported } = translateRules(rules, globalEnabled);
    this.lastDiagnostics = { errors, unsupported: [...new Set(unsupported)] };
    await this.replace(dnrRules);
  }

  diagnostics(): ApplyDiagnostics {
    return this.lastDiagnostics;
  }

  async clear(): Promise<void> {
    this.lastDiagnostics = { errors: [], unsupported: [] };
    await this.replace([]);
  }

  private async replace(addRules: DnrRule[]): Promise<void> {
    const existing = await this.dnr.getDynamicRules();
    await this.dnr.updateDynamicRules({ addRules, removeRuleIds: existing.map((rule) => rule.id) });
  }
}
