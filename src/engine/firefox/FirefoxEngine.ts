import type { Rule } from '../../rules/model';
import type { Capabilities, RequestEngine } from '../RequestEngine';
import { buildBeforeRequest, buildBeforeSendHeaders, buildHeadersReceived } from './handlers';
import type {
  BeforeRequestDetails,
  BeforeSendHeadersDetails,
  BlockingResponse,
  BlockingResult,
  HeadersReceivedDetails,
  HandlerDeps,
} from './types';

type WebRequestEvent<D, R> = {
  addListener(listener: (details: D) => R, filter: { urls: string[] }, extra?: string[]): void;
  removeListener(listener: (details: D) => R): void;
};

export type WebRequestApi = {
  onBeforeRequest: WebRequestEvent<BeforeRequestDetails, BlockingResult>;
  onBeforeSendHeaders: WebRequestEvent<BeforeSendHeadersDetails, BlockingResponse | undefined>;
  onHeadersReceived: WebRequestEvent<HeadersReceivedDetails, BlockingResponse | undefined>;
};

const ALL_URLS = { urls: ['<all_urls>'] };

export class FirefoxEngine implements RequestEngine {
  private registered: (() => void)[] = [];

  constructor(
    private readonly webRequest: WebRequestApi,
    private readonly deps: HandlerDeps,
  ) {}

  capabilities(): Capabilities {
    return { responseBodyRewrite: true, artificialLatency: true };
  }

  async apply(rules: Rule[], globalEnabled: boolean): Promise<void> {
    await this.clear();
    const active = globalEnabled ? rules : [];

    const beforeRequest = buildBeforeRequest(active, this.deps);
    this.webRequest.onBeforeRequest.addListener(beforeRequest, ALL_URLS, ['blocking']);
    this.registered.push(() => this.webRequest.onBeforeRequest.removeListener(beforeRequest));

    const beforeSend = buildBeforeSendHeaders(active);
    this.webRequest.onBeforeSendHeaders.addListener(beforeSend, ALL_URLS, ['blocking', 'requestHeaders']);
    this.registered.push(() => this.webRequest.onBeforeSendHeaders.removeListener(beforeSend));

    const headersReceived = buildHeadersReceived(active, this.deps);
    this.webRequest.onHeadersReceived.addListener(headersReceived, ALL_URLS, ['blocking', 'responseHeaders']);
    this.registered.push(() => this.webRequest.onHeadersReceived.removeListener(headersReceived));
  }

  async clear(): Promise<void> {
    this.registered.forEach((unregister) => unregister());
    this.registered = [];
  }
}
