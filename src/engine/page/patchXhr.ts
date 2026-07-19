import type { RequestDescriptor, Rule } from '../../rules/model';
import { decideInterception } from './decide';
import { applyHeaderOps, parseHeaders } from './headerOps';
import { resolveUrl } from './resolveUrl';
import type { Interception, Sink } from './types';

export type PatchedXhrDeps = {
  OriginalXhr: typeof XMLHttpRequest;
  getRules: () => Rule[];
  getGlobalEnabled: () => boolean;
  sink: Sink;
};

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
    private overrideHeaders: Headers | undefined;
    private requestHeaders: Record<string, string> = {};
    private requestBody: string | undefined;
    private delegate: XMLHttpRequest = new deps.OriginalXhr();

    open(method: string, url: string, ...rest: unknown[]): void {
      this.method = method;
      this.url = resolveUrl(url);
      (this.delegate.open as (m: string, u: string, ...r: unknown[]) => void)(method, url, ...rest);
    }

    setRequestHeader(name: string, value: string): void {
      this.requestHeaders[name] = value;
      this.delegate.setRequestHeader(name, value);
    }

    getResponseHeader(name: string): string | null {
      if (this.overrideHeaders) return this.overrideHeaders.get(name);
      return this.delegate.getResponseHeader(name);
    }

    getAllResponseHeaders(): string {
      if (this.overrideHeaders) {
        const lines: string[] = [];
        this.overrideHeaders.forEach((value, name) => lines.push(`${name}: ${value}`));
        return lines.join('\r\n');
      }
      return this.delegate.getAllResponseHeaders();
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      if (typeof body === 'string') this.requestBody = body;
      const interception = decideInterception(
        deps.getRules(),
        { url: this.url, method: this.method } satisfies RequestDescriptor,
        deps.getGlobalEnabled(),
      );
      this.wire(interception);
      this.delegate.send(body);
    }

    abort(): void {
      this.delegate.abort();
    }

    addEventListener(): void {
      // v1: rely on onload/onreadystatechange assignment
    }

    removeEventListener(): void {
      // no-op in v1
    }

    private wire(interception: Interception): void {
      const delegate = this.delegate;
      delegate.onreadystatechange = () => {
        this.readyState = delegate.readyState;
        this.status = delegate.status;
        if (delegate.readyState === DONE && interception.kind === 'override') {
          this.applyOverride(interception);
        } else {
          this.responseText = delegate.responseText;
          this.response = delegate.response;
        }
        this.onreadystatechange?.call(this as unknown as XMLHttpRequest, new Event('readystatechange'));
      };
      delegate.onload = (event) => this.onload?.call(this as unknown as XMLHttpRequest, event);
      delegate.onerror = (event) => this.onerror?.call(this as unknown as XMLHttpRequest, event);
    }

    private applyOverride(interception: Extract<Interception, { kind: 'override' }>): void {
      const delegate = this.delegate;
      const headers = parseHeaders(delegate.getAllResponseHeaders());
      applyHeaderOps(headers, interception.headerOps);
      this.overrideHeaders = headers;
      const isBodyRewritten = interception.body !== undefined;
      const body = isBodyRewritten ? interception.body! : delegate.responseText;
      if (isBodyRewritten && interception.contentType) headers.set('content-type', interception.contentType);
      this.responseText = body;
      this.response = body;
      deps.sink({
        kind: 'rewrite',
        method: this.method,
        url: this.url,
        status: delegate.status,
        body,
        contentType: headers.get('content-type') ?? undefined,
        requestHeaders: Object.keys(this.requestHeaders).length > 0 ? this.requestHeaders : undefined,
        requestBody: this.requestBody,
      });
    }
  }

  return PatchedXhr as unknown as typeof XMLHttpRequest;
};
