import type { RequestDescriptor, Rule } from '../../rules/model';
import { decideInterception } from './decide';
import { applyHeaderOps } from './headerOps';
import { resolveUrl } from './resolveUrl';
import type { Interception, Sink } from './types';

export type PatchedFetchDeps = {
  originalFetch: typeof fetch;
  getRules: () => Rule[];
  getGlobalEnabled: () => boolean;
  sink: Sink;
};

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return resolveUrl(input);
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return resolveUrl(String(input));
};

const methodOf = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method;
  if (input instanceof Request) return input.method;
  return 'GET';
};

const requestHeadersOf = (input: RequestInfo | URL, init?: RequestInit): Record<string, string> | undefined => {
  const source = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  if (!source) return undefined;
  const headers = new Headers(source);
  const entries: Record<string, string> = {};
  headers.forEach((value, name) => {
    entries[name] = value;
  });
  return Object.keys(entries).length > 0 ? entries : undefined;
};

const requestBodyOf = (init?: RequestInit): string | undefined => {
  const body = init?.body;
  if (typeof body === 'string') return body;
  return undefined;
};

const descriptorOf = (input: RequestInfo | URL, init?: RequestInit): RequestDescriptor => ({
  url: urlOf(input),
  method: methodOf(input, init),
});

export const createPatchedFetch = (deps: PatchedFetchDeps): typeof fetch => {
  const serveOverride = async (
    interception: Extract<Interception, { kind: 'override' }>,
    original: Response,
    request: { method: string; url: string; requestHeaders?: Record<string, string>; requestBody?: string },
  ): Promise<Response> => {
    const headers = new Headers(original.headers);
    applyHeaderOps(headers, interception.headerOps);
    const isBodyRewritten = interception.body !== undefined;
    const body = isBodyRewritten ? interception.body! : await original.text();
    if (isBodyRewritten && interception.contentType) headers.set('content-type', interception.contentType);
    const contentType = headers.get('content-type') ?? undefined;
    deps.sink({ ...request, kind: 'rewrite', status: original.status, body, contentType });
    return new Response(body, {
      status: original.status,
      statusText: original.statusText,
      headers,
    });
  };

  const forwardInitOf = (
    interception: Extract<Interception, { kind: 'override' }>,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): RequestInit | undefined => {
    const hasHeaderOps = interception.requestHeaderOps.length > 0;
    const hasBody = interception.requestBody !== undefined;
    if (!hasHeaderOps && !hasBody) return init;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    applyHeaderOps(headers, interception.requestHeaderOps);
    return { ...init, headers, ...(hasBody ? { body: interception.requestBody } : {}) };
  };

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const interception = decideInterception(deps.getRules(), descriptorOf(input, init), deps.getGlobalEnabled());
    if (interception.kind !== 'override') return deps.originalFetch(input, init);
    const forwardInit = forwardInitOf(interception, input, init);
    const request = {
      method: methodOf(input, forwardInit),
      url: urlOf(input),
      requestHeaders: requestHeadersOf(input, forwardInit),
      requestBody: requestBodyOf(forwardInit),
    };
    const original = await deps.originalFetch(input, forwardInit);
    const hasResponseOverride = interception.body !== undefined || interception.headerOps.length > 0;
    if (!hasResponseOverride) return original;
    return serveOverride(interception, original, request);
  };
};
