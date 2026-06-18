import type { HeaderOp } from '../../rules/model';

export type Interception =
  | { kind: 'passthrough' }
  | {
      kind: 'mock';
      status: number;
      body: string;
      contentType?: string;
      headers: HeaderOp[];
      latencyMs?: number;
    }
  | { kind: 'rewrite'; body: string; contentType?: string };

export type InterceptReport = {
  kind: 'mock' | 'rewrite';
  method: string;
  url: string;
  status: number;
  body: string;
  contentType?: string;
};

export type Sink = (report: InterceptReport) => void;

export type Timer = (ms: number) => Promise<void>;

export type RuleProvider = () => import('../../rules/model').Rule[];
