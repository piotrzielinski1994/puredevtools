import type { Rule } from '../../rules/model';
import type { Capabilities, RequestEngine } from '../RequestEngine';
import type { DnrRule } from './dnrTypes';
import { translateRules } from './translateToDnr';

export type DnrApi = {
  getDynamicRules(): Promise<{ id: number }[]>;
  updateDynamicRules(update: { addRules: DnrRule[]; removeRuleIds: number[] }): Promise<void>;
};

export class ChromeEngine implements RequestEngine {
  constructor(private readonly dnr: DnrApi) {}

  capabilities(): Capabilities {
    return { responseBodyRewrite: false, artificialLatency: false };
  }

  async apply(rules: Rule[], globalEnabled: boolean): Promise<void> {
    const { dnrRules } = translateRules(rules, globalEnabled);
    await this.replace(dnrRules);
  }

  async clear(): Promise<void> {
    await this.replace([]);
  }

  private async replace(addRules: DnrRule[]): Promise<void> {
    const existing = await this.dnr.getDynamicRules();
    await this.dnr.updateDynamicRules({ addRules, removeRuleIds: existing.map((rule) => rule.id) });
  }
}
