import type { HeaderOp, RequestDescriptor, Rule } from "../../rules/model";
import { decideInterception } from "./decide";
import { applyHeaderOps, parseHeaders } from "./headerOps";
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

const scriptConsoleSink = (...args: unknown[]): void => console.log(...args);

const logScriptError = (stage: "pre" | "post", error: string): void =>
  console.error("[puredevtools script]", `${stage} error:`, error);

export type PatchedXhrDeps = {
  OriginalXhr: typeof XMLHttpRequest;
  getRules: () => Rule[];
  getGlobalEnabled: () => boolean;
  sink: Sink;
};

const DONE = 4;

export const createPatchedXhr = (
  deps: PatchedXhrDeps,
): typeof XMLHttpRequest => {
  class PatchedXhr {
    onload: ((this: XMLHttpRequest, event: ProgressEvent) => unknown) | null =
      null;
    onreadystatechange:
      | ((this: XMLHttpRequest, event: Event) => unknown)
      | null = null;
    onerror: ((this: XMLHttpRequest, event: ProgressEvent) => unknown) | null =
      null;
    readyState = 0;
    status = 0;
    responseText = "";
    response: unknown = "";

    private method = "GET";
    private url = "";
    private overrideHeaders: Headers | undefined;
    private requestHeaders: Record<string, string> = {};
    private requestBody: string | undefined;
    private delegate: XMLHttpRequest = new deps.OriginalXhr();

    open(method: string, url: string, ...rest: unknown[]): void {
      this.method = method;
      this.url = resolveUrl(url);
      (this.delegate.open as (m: string, u: string, ...r: unknown[]) => void)(
        method,
        url,
        ...rest,
      );
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
        this.overrideHeaders.forEach((value, name) => {
          lines.push(`${name}: ${value}`);
        });
        return lines.join("\r\n");
      }
      return this.delegate.getAllResponseHeaders();
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      if (typeof body === "string") this.requestBody = body;
      const interception: Interception = isScriptRunning()
        ? { kind: "passthrough" }
        : decideInterception(
            deps.getRules(),
            { url: this.url, method: this.method } satisfies RequestDescriptor,
            deps.getGlobalEnabled(),
          );
      this.wire(interception);
      if (interception.kind !== "override") {
        this.delegate.send(body);
        return;
      }
      if (interception.preScript === undefined) {
        this.delegate.send(this.applyRequestOverride(interception, body));
        return;
      }
      void this.sendWithPreScript(interception, body);
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

    private donePromise: Promise<void> | undefined;

    private applyRequestOverride(
      interception: Extract<Interception, { kind: "override" }>,
      body?: Document | XMLHttpRequestBodyInit | null,
    ): Document | XMLHttpRequestBodyInit | null | undefined {
      if (interception.requestUrl !== undefined) {
        this.url = interception.requestUrl;
        (this.delegate.open as (m: string, u: string) => void)(
          this.method,
          interception.requestUrl,
        );
        Object.entries(this.requestHeaders).forEach(([name, value]) => {
          this.delegate.setRequestHeader(name, value);
        });
      }
      interception.requestHeaderOps
        .filter((op): op is Extract<HeaderOp, { op: "set" }> => op.op === "set")
        .forEach((op) => {
          this.delegate.setRequestHeader(op.name, op.value);
        });
      if (interception.requestBody === undefined) return body;
      this.requestBody = interception.requestBody;
      return interception.requestBody;
    }

    private async sendWithPreScript(
      interception: Extract<Interception, { kind: "override" }>,
      body?: Document | XMLHttpRequestBodyInit | null,
    ): Promise<void> {
      const headers = new Headers(this.requestHeaders);
      applyHeaderOps(headers, interception.requestHeaderOps);
      const startBody =
        interception.requestBody ??
        (typeof body === "string" ? body : undefined);
      const startUrl = interception.requestUrl ?? this.url;
      const mutable: MutableRequest = {
        url: startUrl,
        method: this.method,
        headers,
        body: startBody,
      };
      const outcome = await runScript(interception.preScript!, {
        req: createRequestFacade(mutable),
        console: createConsoleFacade(scriptConsoleSink),
      });
      if (!outcome.ok) {
        logScriptError("pre", outcome.error);
        this.delegate.send(this.applyRequestOverride(interception, body));
        return;
      }
      this.method = mutable.method;
      this.url = resolveUrl(mutable.url);
      (this.delegate.open as (m: string, u: string) => void)(
        mutable.method,
        mutable.url,
      );
      mutable.headers.forEach((value, name) => {
        this.delegate.setRequestHeader(name, value);
      });
      const forwardBody =
        mutable.body ?? (typeof body === "string" ? undefined : body);
      this.requestBody =
        typeof forwardBody === "string" ? forwardBody : this.requestBody;
      this.delegate.send(forwardBody ?? null);
    }

    private wire(interception: Interception): void {
      const delegate = this.delegate;
      delegate.onreadystatechange = () => {
        this.readyState = delegate.readyState;
        this.status = delegate.status;
        if (delegate.readyState === DONE && interception.kind === "override") {
          this.donePromise = this.applyOverride(interception).then(() => {
            this.onreadystatechange?.call(
              this as unknown as XMLHttpRequest,
              new Event("readystatechange"),
            );
          });
          return;
        }
        this.responseText = delegate.responseText;
        this.response = delegate.response;
        this.onreadystatechange?.call(
          this as unknown as XMLHttpRequest,
          new Event("readystatechange"),
        );
      };
      delegate.onload = (event) => {
        const fire = (): void =>
          void this.onload?.call(this as unknown as XMLHttpRequest, event);
        if (this.donePromise) void this.donePromise.then(fire);
        else fire();
      };
      delegate.onerror = (event) =>
        this.onerror?.call(this as unknown as XMLHttpRequest, event);
    }

    private async applyOverride(
      interception: Extract<Interception, { kind: "override" }>,
    ): Promise<void> {
      const delegate = this.delegate;
      const headers = parseHeaders(delegate.getAllResponseHeaders());
      applyHeaderOps(headers, interception.headerOps);
      const isBodyRewritten = interception.body !== undefined;
      let body = isBodyRewritten ? interception.body! : delegate.responseText;
      if (isBodyRewritten && interception.contentType)
        headers.set("content-type", interception.contentType);

      if (interception.postScript !== undefined) {
        const scriptHeaders = new Headers(headers);
        const mutable: MutableResponse = {
          status: delegate.status,
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

      this.overrideHeaders = headers;
      this.responseText = body;
      this.response = body;
      deps.sink({
        kind: "rewrite",
        method: this.method,
        url: this.url,
        status: delegate.status,
        body,
        contentType: headers.get("content-type") ?? undefined,
        requestHeaders:
          Object.keys(this.requestHeaders).length > 0
            ? this.requestHeaders
            : undefined,
        requestBody: this.requestBody,
      });
    }
  }

  return PatchedXhr as unknown as typeof XMLHttpRequest;
};
