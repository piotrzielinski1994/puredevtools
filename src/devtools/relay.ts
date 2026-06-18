import type { InterceptReport } from '../engine/page/types';
import type { RelayPort } from './types';

export class ReportRelay {
  private readonly ports = new Map<number, RelayPort>();

  register(tabId: number, port: RelayPort): void {
    this.ports.set(tabId, port);
    port.onDisconnect.addListener(() => {
      if (this.ports.get(tabId) === port) this.ports.delete(tabId);
    });
  }

  dispatch(tabId: number, report: InterceptReport): void {
    this.ports.get(tabId)?.postMessage({ type: 'report', report });
  }

  unregister(tabId: number): void {
    this.ports.delete(tabId);
  }
}
