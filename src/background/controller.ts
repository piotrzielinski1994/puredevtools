import type { RequestEngine } from '../engine/RequestEngine';
import type { RuleRepository } from '../rules/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Message, MessageResponse } from '../shared/messages';

export type StorageChangeSubscriber = {
  subscribe(listener: (changedKeys: string[]) => void): void;
};

export type Scheduler = {
  schedule(task: () => void): void;
};

export type ControllerDeps = {
  repository: RuleRepository;
  engine: RequestEngine;
  storageChanges: StorageChangeSubscriber;
  scheduler: Scheduler;
};

const OWNED_KEYS: string[] = [STORAGE_KEYS.rules, STORAGE_KEYS.globalEnabled];

export class BackgroundController {
  constructor(private readonly deps: ControllerDeps) {}

  async start(): Promise<void> {
    this.deps.storageChanges.subscribe((changedKeys) => this.onStorageChange(changedKeys));
    await this.applyFromStorage();
  }

  async reapply(): Promise<void> {
    await this.applyFromStorage();
  }

  async handleMessage(message: Message): Promise<MessageResponse> {
    switch (message.type) {
      case 'getCapabilities':
        return { ok: true, type: 'capabilities', capabilities: this.deps.engine.capabilities() };
      case 'getDiagnostics':
        return { ok: true, type: 'diagnostics', diagnostics: this.deps.engine.diagnostics?.() ?? { errors: [], unsupported: [] } };
      case 'reapply':
        return this.tryReapply();
      default:
        return { ok: false, error: `Unknown message type: ${(message as { type: string }).type}` };
    }
  }

  private async tryReapply(): Promise<MessageResponse> {
    try {
      await this.applyFromStorage();
      return { ok: true, type: 'reapplied' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private onStorageChange(changedKeys: string[]): void {
    const isRelevant = changedKeys.some((key) => OWNED_KEYS.includes(key));
    if (!isRelevant) return;
    this.deps.scheduler.schedule(() => {
      void this.applyFromStorage();
    });
  }

  private async applyFromStorage(): Promise<void> {
    const [rules, globalEnabled] = await Promise.all([
      this.deps.repository.getAll(),
      this.deps.repository.getGlobalEnabled(),
    ]);
    await this.deps.engine.apply(rules, globalEnabled);
  }
}
