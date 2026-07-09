import type { ResourceType } from '../../rules/model';
import type { InterceptReport } from '../page/types';

export type WebRequestHeader = { name: string; value?: string };

export type BeforeSendHeadersDetails = {
  url: string;
  method: string;
  type: ResourceType;
  requestHeaders?: WebRequestHeader[];
};

export type BeforeRequestDetails = {
  requestId: string;
  url: string;
  method: string;
  type: ResourceType;
  requestHeaders?: WebRequestHeader[];
};

export type HeadersReceivedDetails = {
  url: string;
  method: string;
  type: ResourceType;
  tabId?: number;
  statusCode: number;
  statusLine?: string;
  responseHeaders?: WebRequestHeader[];
};

export type BlockingResponse = {
  cancel?: boolean;
  redirectUrl?: string;
  requestHeaders?: WebRequestHeader[];
  responseHeaders?: WebRequestHeader[];
  statusLine?: string;
};

export type BlockingResult = BlockingResponse | Promise<BlockingResponse | undefined> | undefined;

export type StreamFilter = {
  ondata: ((event: { data: ArrayBuffer }) => void) | null;
  onstop: (() => void) | null;
  write(data: Uint8Array): void;
  disconnect(): void;
  close(): void;
};

export type HandlerDeps = {
  filterResponseData: (requestId: string) => StreamFilter;
  delay: (ms: number) => Promise<void>;
  report?: (tabId: number, report: InterceptReport) => void;
  now?: () => number;
};
