import type { RequestDescriptor, Rule } from '../../rules/model';
import { decideInterception } from './decide';
import type { Sink, Timer } from './types';

export type PatchedXhrDeps = {
  OriginalXhr: typeof XMLHttpRequest;
  getRules: () => Rule[];
  getGlobalEnabled: () => boolean;
  sink: Sink;
  delay: Timer;
};

const RESOURCE_TYPE: RequestDescriptor['resourceType'] = 'xmlhttprequest';
const DONE = 4;

export const createPatchedXhr = (deps: PatchedXhrDeps): typeof XMLHttpRequest => {
  class PatchedXhr {
    onload: ((this: XMLHttpRequest, event: ProgressEvent) => unknown) | null = null;
    onreadystatechange: ((this: XMLHttpRequest, event: Event) => unknown) | null = null;
    onerror: ((this: XMLHttpRequest, event: ProgressEvent) => unknown) | null = null;
    readyState = 0;
    status = 0;
    responseText = '';
    response: unknown = '';

    private method = 'GET';
    private url = '';
    private mockHeaders: Record<string, string> = {};
    private delegate: XMLHttpRequest | undefined;

    open(method: string, url: string, ...rest: unknown[]): void {
      this.method = method;
      this.url = url;
      const interception = decideInterception(
        deps.getRules(),
        { url, method, resourceType: RESOURCE_TYPE },
        deps.getGlobalEnabled(),
      );
      if (interception.kind === 'mock') return;
      this.delegate = new deps.OriginalXhr();
      (this.delegate.open as (m: string, u: string, ...r: unknown[]) => void)(method, url, ...rest);
    }

    setRequestHeader(name: string, value: string): void {
      this.delegate?.setRequestHeader(name, value);
    }

    getResponseHeader(name: string): string | null {
      if (this.delegate) return this.delegate.getResponseHeader(name);
      return this.mockHeaders[name.toLowerCase()] ?? null;
    }

    getAllResponseHeaders(): string {
      if (this.delegate) return this.delegate.getAllResponseHeaders();
      return Object.entries(this.mockHeaders)
        .map(([name, value]) => `${name}: ${value}`)
        .join('\r\n');
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      if (this.delegate) {
        this.forwardDelegate();
        this.delegate.send(body);
        return;
      }
      void this.serveMock();
    }

    abort(): void {
      this.delegate?.abort();
    }

    addEventListener(): void {
      // v1: rely on onload/onreadystatechange assignment; listeners delegated when proxying
    }

    removeEventListener(): void {
      // no-op in v1
    }

    private forwardDelegate(): void {
      const delegate = this.delegate;
      if (!delegate) return;
      delegate.onreadystatechange = () => {
        this.readyState = delegate.readyState;
        this.status = delegate.status;
        this.responseText = delegate.responseText;
        this.response = delegate.response;
        this.onreadystatechange?.call(this as unknown as XMLHttpRequest, new Event('readystatechange'));
      };
      delegate.onload = (event) => this.onload?.call(this as unknown as XMLHttpRequest, event);
      delegate.onerror = (event) => this.onerror?.call(this as unknown as XMLHttpRequest, event);
    }

    private async serveMock(): Promise<void> {
      const interception = decideInterception(
        deps.getRules(),
        { url: this.url, method: this.method, resourceType: RESOURCE_TYPE },
        deps.getGlobalEnabled(),
      );
      if (interception.kind !== 'mock') return;
      if (interception.latencyMs && interception.latencyMs > 0) await deps.delay(interception.latencyMs);

      this.mockHeaders = {};
      if (interception.contentType) this.mockHeaders['content-type'] = interception.contentType;
      interception.headers.forEach((op) => {
        if (op.op === 'set') this.mockHeaders[op.name.toLowerCase()] = op.value;
        else delete this.mockHeaders[op.name.toLowerCase()];
      });

      this.status = interception.status;
      this.responseText = interception.body;
      this.response = interception.body;
      this.readyState = DONE;
      deps.sink({ kind: 'mock', method: this.method, url: this.url, status: interception.status, body: interception.body, contentType: interception.contentType });
      this.onreadystatechange?.call(this as unknown as XMLHttpRequest, new Event('readystatechange'));
      this.onload?.call(this as unknown as XMLHttpRequest, new ProgressEvent('load'));
    }
  }

  return PatchedXhr as unknown as typeof XMLHttpRequest;
};
