import type { Rule } from '../rules/model';

export type Capabilities = {
  responseBodyRewrite: boolean;
  artificialLatency: boolean;
};

export type ApplyDiagnostics = {
  errors: string[];
  unsupported: string[];
};

export type RequestEngine = {
  capabilities(): Capabilities;
  apply(rules: Rule[], globalEnabled: boolean): Promise<void>;
  clear(): Promise<void>;
  diagnostics?(): ApplyDiagnostics;
};
