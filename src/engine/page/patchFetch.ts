import type { RequestDescriptor, Rule } from "../../rules/model";
import { decideInterception } from "./decide";
import { applyHeaderOps } from "./headerOps";
import { resolveUrl } from "./resolveUrl";
import {
  createConsoleFacade,
  createRequestFacade,
  createResponseFacade,
  type MutableRequest,
  type MutableResponse,
} from "./script/facades";
import { isScriptRunning, runScript } from "./script/runScript";
import type { Interception, Sink } from "./types";

export type PatchedFetchDeps = {
  originalFetch: typeof fetch;
  getRules: () => Rule[];
  getGlobalEnabled: () => boolean;
  sink: Sink;
};

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return resolveUrl(input);
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return resolveUrl(String(input));
};

const methodOf = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method;
  if (input instanceof Request) return input.method;
  return "GET";
};

const requestHeadersOf = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Record<string, string> | undefined => {
  const source =
    init?.headers ?? (input instanceof Request ? input.headers : undefined);
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
  if (typeof body === "string") return body;
  return undefined;
};

const descriptorOf = (
  input: RequestInfo | URL,
  init?: RequestInit,
): RequestDescriptor => ({
  url: urlOf(input),
  method: methodOf(input, init),
});

const mutableRequestOf = (
  input: RequestInfo | URL,
  init?: RequestInit,
): MutableRequest => ({
  url: urlOf(input),
  method: methodOf(input, init),
  headers: new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  ),
  body: requestBodyOf(init),
});

const scriptConsoleSink = (...args: unknown[]): void => console.log(...args);

const logScriptError = (stage: "pre" | "post", error: string): void =>
  console.error("[puredevtools script]", `${stage} error:`, error);

export const createPatchedFetch = (deps: PatchedFetchDeps): typeof fetch => {
  const serveOverride = async (
    interception: Extract<Interception, { kind: "override" }>,
    original: Response,
    request: {
      method: string;
      url: string;
      requestHeaders?: Record<string, string>;
      requestBody?: string;
    },
  ): Promise<Response> => {
    const headers = new Headers(original.headers);
    applyHeaderOps(headers, interception.headerOps);
    const isBodyRewritten = interception.body !== undefined;
    let body = isBodyRewritten ? interception.body! : await original.text();
    if (isBodyRewritten && interception.contentType)
      headers.set("content-type", interception.contentType);

    if (interception.postScript !== undefined) {
      const scriptHeaders = new Headers(headers);
      const mutable: MutableResponse = {
        status: original.status,
        headers: scriptHeaders,
        body,
      };
      const outcome = await runScript(interception.postScript, {
        res: createResponseFacade(mutable),
        console: createConsoleFacade(scriptConsoleSink),
      });
      if (outcome.ok) {
        body = mutable.body;
        scriptHeaders.forEach((value, name) => {
          headers.set(name, value);
        });
        [...headers.keys()]
          .filter((name) => !scriptHeaders.has(name))
          .forEach((name) => {
            headers.delete(name);
          });
      } else {
        logScriptError("post", outcome.error);
      }
    }

    const contentType = headers.get("content-type") ?? undefined;
    deps.sink({
      ...request,
      kind: "rewrite",
      status: original.status,
      body,
      contentType,
    });
    return new Response(body, {
      status: original.status,
      statusText: original.statusText,
      headers,
    });
  };

  const applyPreScript = async (
    interception: Extract<Interception, { kind: "override" }>,
    input: RequestInfo | URL,
    forwardInit: RequestInit | undefined,
  ): Promise<{ input: RequestInfo | URL; init: RequestInit | undefined }> => {
    if (interception.preScript === undefined)
      return { input, init: forwardInit };
    const mutable = mutableRequestOf(input, forwardInit);
    const outcome = await runScript(interception.preScript, {
      req: createRequestFacade(mutable),
      console: createConsoleFacade(scriptConsoleSink),
    });
    if (!outcome.ok) {
      logScriptError("pre", outcome.error);
      return { input, init: forwardInit };
    }
    return {
      input: mutable.url,
      init: {
        ...forwardInit,
        method: mutable.method,
        headers: mutable.headers,
        ...(mutable.body !== undefined ? { body: mutable.body } : {}),
      },
    };
  };

  const applyUrlRewrite = (
    interception: Extract<Interception, { kind: "override" }>,
    input: RequestInfo | URL,
  ): RequestInfo | URL => {
    if (interception.requestUrl === undefined) return input;
    if (input instanceof Request)
      return new Request(interception.requestUrl, input);
    return interception.requestUrl;
  };

  const forwardInitOf = (
    interception: Extract<Interception, { kind: "override" }>,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): RequestInit | undefined => {
    const hasHeaderOps = interception.requestHeaderOps.length > 0;
    const hasBody = interception.requestBody !== undefined;
    if (!hasHeaderOps && !hasBody) return init;
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    applyHeaderOps(headers, interception.requestHeaderOps);
    return {
      ...init,
      headers,
      ...(hasBody ? { body: interception.requestBody } : {}),
    };
  };

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (isScriptRunning()) return deps.originalFetch(input, init);
    const interception = decideInterception(
      deps.getRules(),
      descriptorOf(input, init),
      deps.getGlobalEnabled(),
    );
    if (interception.kind !== "override")
      return deps.originalFetch(input, init);
    const rewritten = applyUrlRewrite(interception, input);
    const forwarded = await applyPreScript(
      interception,
      rewritten,
      forwardInitOf(interception, rewritten, init),
    );
    const request = {
      method: methodOf(forwarded.input, forwarded.init),
      url: urlOf(forwarded.input),
      requestHeaders: requestHeadersOf(forwarded.input, forwarded.init),
      requestBody: requestBodyOf(forwarded.init),
    };
    const original = await deps.originalFetch(forwarded.input, forwarded.init);
    const hasResponseOverride =
      interception.body !== undefined ||
      interception.headerOps.length > 0 ||
      interception.postScript !== undefined;
    if (!hasResponseOverride) return original;
    return serveOverride(interception, original, request);
  };
};
