import type { HeaderOp, RequestDescriptor, Rule } from '../../rules/model';
import { decideInterception } from './decide';
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

const applyHeaderOps = (headers: Headers, ops: HeaderOp[]): void => {
  ops.forEach((op) => {
    if (op.op === 'set') headers.set(op.name, op.value);
    else headers.delete(op.name);
  });
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

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = {
      method: methodOf(input, init),
      url: urlOf(input),
      requestHeaders: requestHeadersOf(input, init),
      requestBody: requestBodyOf(init),
    };
    const interception = decideInterception(deps.getRules(), descriptorOf(input, init), deps.getGlobalEnabled());
    if (interception.kind !== 'override') return deps.originalFetch(input, init);
    const original = await deps.originalFetch(input, init);
    return serveOverride(interception, original, request);
  };
};
