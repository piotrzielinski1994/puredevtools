import type { Capabilities } from '../engine/RequestEngine';

export type Message = { type: 'getCapabilities' } | { type: 'reapply' };

export type MessageResponse =
  | { ok: true; type: 'capabilities'; capabilities: Capabilities }
  | { ok: true; type: 'reapplied' }
  | { ok: false; error: string };
