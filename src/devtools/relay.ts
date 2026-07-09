import type { InterceptReport } from '../engine/page/types';
import type { RelayPort } from './types';

export const MAX_BUFFERED = 100;

export class ReportRelay {
  private readonly ports = new Map<number, RelayPort>();
  private readonly buffers = new Map<number, InterceptReport[]>();

  register(tabId: number, port: RelayPort): void {
    this.ports.set(tabId, port);
    const buffered = this.buffers.get(tabId);
    if (buffered) {
      buffered.forEach((report) => port.postMessage({ type: 'report', report }));
      this.buffers.delete(tabId);
    }
    port.onDisconnect.addListener(() => {
      if (this.ports.get(tabId) === port) this.ports.delete(tabId);
    });
  }

  dispatch(tabId: number, report: InterceptReport): void {
    const port = this.ports.get(tabId);
    if (port) {
      port.postMessage({ type: 'report', report });
      return;
    }
    this.buffer(tabId, report);
  }

  unregister(tabId: number): void {
    this.ports.delete(tabId);
    this.buffers.delete(tabId);
  }

  private buffer(tabId: number, report: InterceptReport): void {
    const existing = this.buffers.get(tabId) ?? [];
    const next = [...existing, report];
    this.buffers.set(tabId, next.length > MAX_BUFFERED ? next.slice(next.length - MAX_BUFFERED) : next);
  }
}
