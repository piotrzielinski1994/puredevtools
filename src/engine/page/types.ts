import type { HeaderOp } from '../../rules/model';

export type Interception =
  | { kind: 'passthrough' }
  | {
      kind: 'override';
      headerOps: HeaderOp[];
      body?: string;
      contentType?: string;
      requestHeaderOps: HeaderOp[];
      requestBody?: string;
      requestUrl?: string;
      preScript?: string;
      postScript?: string;
    };

export type InterceptReport = {
  kind: 'rewrite';
  method: string;
  url: string;
  status: number;
  body: string;
  contentType?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  timestamp?: number;
};

export type Sink = (report: InterceptReport) => void;

export type RuleProvider = () => import('../../rules/model').Rule[];
