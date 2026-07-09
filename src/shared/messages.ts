import type { ApplyDiagnostics, Capabilities } from '../engine/RequestEngine';

export type Message = { type: 'getCapabilities' } | { type: 'reapply' } | { type: 'getDiagnostics' };

export type MessageResponse =
  | { ok: true; type: 'capabilities'; capabilities: Capabilities }
  | { ok: true; type: 'reapplied' }
  | { ok: true; type: 'diagnostics'; diagnostics: ApplyDiagnostics }
  | { ok: false; error: string };
