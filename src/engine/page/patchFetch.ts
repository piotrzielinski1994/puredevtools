import type { HeaderOp, RequestDescriptor, Rule } from '../../rules/model';
import { decideInterception } from './decide';
import type { Interception, Sink, Timer } from './types';

export type PatchedFetchDeps = {
  originalFetch: typeof fetch;
  getRules: () => Rule[];
  getGlobalEnabled: () => boolean;
  sink: Sink;
  delay: Timer;
};

const RESOURCE_TYPE: RequestDescriptor['resourceType'] = 'xmlhttprequest';

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
};

const methodOf = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method;
  if (input instanceof Request) return input.method;
  return 'GET';
};

const buildHeaders = (ops: HeaderOp[], contentType?: string): Headers => {
  const headers = new Headers();
  if (contentType) headers.set('content-type', contentType);
  ops.forEach((op) => {
    if (op.op === 'set') headers.set(op.name, op.value);
    else headers.delete(op.name);
  });
  return headers;
};

export const createPatchedFetch = (deps: PatchedFetchDeps): typeof fetch => {
  const serveMock = async (
    interception: Extract<Interception, { kind: 'mock' }>,
    method: string,
    url: string,
  ): Promise<Response> => {
    if (interception.latencyMs && interception.latencyMs > 0) await deps.delay(interception.latencyMs);
    deps.sink({ kind: 'mock', method, url, status: interception.status, body: interception.body });
    return new Response(interception.body, {
      status: interception.status,
      headers: buildHeaders(interception.headers, interception.contentType),
    });
  };

  const serveRewrite = async (
    interception: Extract<Interception, { kind: 'rewrite' }>,
    original: Response,
    method: string,
    url: string,
  ): Promise<Response> => {
    const headers = new Headers(original.headers);
    if (interception.contentType) headers.set('content-type', interception.contentType);
    deps.sink({ kind: 'rewrite', method, url, status: original.status, body: interception.body });
    return new Response(interception.body, {
      status: original.status,
      statusText: original.statusText,
      headers,
    });
  };

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const method = methodOf(input, init);
    const interception = decideInterception(deps.getRules(), { url, method, resourceType: RESOURCE_TYPE }, deps.getGlobalEnabled());

    if (interception.kind === 'mock') return serveMock(interception, method, url);
    if (interception.kind === 'rewrite') {
      const original = await deps.originalFetch(input, init);
      return serveRewrite(interception, original, method, url);
    }
    return deps.originalFetch(input, init);
  };
};
