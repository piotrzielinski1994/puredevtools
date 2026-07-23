// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Matchers, Rule, RuleAction } from "../../rules/model";
import { createPatchedXhr } from "./patchXhr";
import type { InterceptReport } from "./types";

const buildRule = (
  actions: RuleAction[],
  matchers: Matchers = { url: { pattern: "https://api.x/*", kind: "glob" } },
  overrides: Partial<Rule> = {},
): Rule => ({
  id: "rule-1",
  name: "test rule",
  enabled: true,
  matchers,
  actions,
  ...overrides,
});

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

type Deps = Parameters<typeof createPatchedXhr>[0];

const createDeps = (overrides: Partial<Deps> = {}): Deps => ({
  OriginalXhr: globalThis.XMLHttpRequest,
  getRules: () => [],
  getGlobalEnabled: () => true,
  sink: () => undefined,
  ...overrides,
});

const xhrClassReturning = (fake: FakeXhr): typeof XMLHttpRequest =>
  class {
    constructor() {
      return fake;
    }
  } as unknown as typeof XMLHttpRequest;

class FakeXhr {
  onreadystatechange: (() => void) | null = null;
  onload: ((event: ProgressEvent) => void) | null = null;
  onerror: ((event: ProgressEvent) => void) | null = null;
  readyState = 0;
  status = 0;
  responseText = "";
  response: unknown = "";
  openArgs: Array<{ method: string; url: string }> = [];
  sent: unknown[] = [];
  requestHeaders: Array<{ name: string; value: string }> = [];
  aborted = false;
  private responseHeaders: Record<string, string>;
  private realBody: string;
  private realStatus: number;

  constructor(
    realBody = "real-body",
    realStatus = 200,
    responseHeaders: Record<string, string> = { "x-real": "yes" },
  ) {
    this.realBody = realBody;
    this.realStatus = realStatus;
    this.responseHeaders = responseHeaders;
  }

  open(method: string, url: string): void {
    this.openArgs.push({ method, url });
  }
  setRequestHeader(name: string, value: string): void {
    this.requestHeaders.push({ name, value });
  }
  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  getAllResponseHeaders(): string {
    return Object.entries(this.responseHeaders)
      .map(([name, value]) => `${name}: ${value}`)
      .join("\r\n");
  }
  abort(): void {
    this.aborted = true;
  }
  send(body?: unknown): void {
    this.sent.push(body ?? null);
    this.readyState = 4;
    this.status = this.realStatus;
    this.responseText = this.realBody;
    this.response = this.realBody;
    this.onreadystatechange?.();
    this.onload?.(new ProgressEvent("load"));
  }
}

describe("createPatchedXhr body rewrite (AC-005)", () => {
  it("should forward the real request and rewrite responseText/response while preserving status", async () => {
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "rewriteBody",
              body: '{"replaced":true}',
              contentType: "application/json",
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    const onload = vi.fn();
    xhr.onload = onload;
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(fake.sent).toHaveLength(1);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe('{"replaced":true}');
    expect(xhr.response).toBe('{"replaced":true}');
    expect(xhr.getResponseHeader("content-type")).toBe("application/json");
    expect(onload).toHaveBeenCalled();
  });
});

describe("createPatchedXhr header override (AC-005)", () => {
  it("should forward and apply set/remove header ops onto the real response headers", async () => {
    const fake = new FakeXhr("body", 200, {
      "set-cookie": "sid=1",
      "x-old": "keep",
    });
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "modifyResponseHeaders",
              headers: [
                { op: "set", name: "X-Test", value: "on" },
                { op: "remove", name: "Set-Cookie" },
              ],
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(xhr.getResponseHeader("x-test")).toBe("on");
    expect(xhr.getResponseHeader("set-cookie")).toBeNull();
    expect(xhr.getResponseHeader("x-old")).toBe("keep");
    expect(xhr.getAllResponseHeaders()).toContain("x-test: on");
    expect(xhr.responseText).toBe("body");
  });
});

describe("createPatchedXhr passthrough (AC-006)", () => {
  it("should forward and expose the real response unchanged when no rule matches", async () => {
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([{ type: "rewriteBody", body: "x" }], {
            url: { pattern: "https://other.x/*", kind: "glob" },
          }),
        ],
      }),
    );

    const xhr = new Patched();
    const states: number[] = [];
    xhr.onreadystatechange = (): void => {
      states.push(xhr.readyState);
    };
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(fake.openArgs).toEqual([
      { method: "GET", url: "https://api.x/users" },
    ]);
    expect(states).toContain(4);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe("real-body");
  });

  it("should forward unchanged when global interception is disabled", async () => {
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getGlobalEnabled: () => false,
        getRules: () => [buildRule([{ type: "rewriteBody", body: "x" }])],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(fake.sent).toHaveLength(1);
    expect(xhr.responseText).toBe("real-body");
  });
});

describe("createPatchedXhr relative URL resolution", () => {
  it("should resolve a relative open() url against the page origin before matching a full-URL rule", async () => {
    const origin = window.location.origin;
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([{ type: "rewriteBody", body: "resolved" }], {
            url: { pattern: `${origin}/base/makes`, kind: "regex" },
          }),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "/base/makes?culture=en-CA");
    xhr.send();

    await flush();

    expect(xhr.responseText).toBe("resolved");
    expect(fake.openArgs).toEqual([
      { method: "GET", url: "/base/makes?culture=en-CA" },
    ]);
  });

  it("should report the resolved absolute url in the sink for a relative xhr", async () => {
    const origin = window.location.origin;
    const fake = new FakeXhr("real-body", 200);
    const reports: InterceptReport[] = [];
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        sink: (report) => reports.push(report),
        getRules: () => [
          buildRule([{ type: "rewriteBody", body: "ok" }], {
            url: { pattern: `${origin}/base/*`, kind: "glob" },
          }),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "/base/makes");
    xhr.send();

    await flush();

    expect(reports[0].url).toBe(`${origin}/base/makes`);
  });
});

describe("createPatchedXhr request override (AC-004)", () => {
  it("should call delegate.setRequestHeader for a set op and delegate.send with the override request body (TC-009)", async () => {
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "modifyRequestHeaders",
              headers: [{ op: "set", name: "X-Env", value: "staging" }],
            },
            { type: "rewriteRequestBody", body: '{"q":2}' },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users");
    xhr.send('{"q":1}');

    await flush();

    expect(fake.requestHeaders).toContainEqual({
      name: "X-Env",
      value: "staging",
    });
    expect(fake.sent).toEqual(['{"q":2}']);
  });

  it("should not throw and not call any removal API for a request-header remove op (TC-010)", async () => {
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "modifyRequestHeaders",
              headers: [{ op: "remove", name: "X-Secret" }],
            },
            { type: "rewriteRequestBody", body: '{"q":2}' },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users");
    expect(() => xhr.send('{"q":1}')).not.toThrow();

    await flush();

    expect(fake.requestHeaders).toEqual([]);
    expect(fake.sent).toEqual(['{"q":2}']);
  });
});

describe("createPatchedXhr plumbing", () => {
  it("should forward setRequestHeader and abort to the delegate", async () => {
    const fake = new FakeXhr();
    const Patched = createPatchedXhr(
      createDeps({ OriginalXhr: xhrClassReturning(fake), getRules: () => [] }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    xhr.setRequestHeader("X-Test", "on");
    xhr.abort();

    expect(fake.requestHeaders).toEqual([{ name: "X-Test", value: "on" }]);
    expect(fake.aborted).toBe(true);
  });

  it("should preserve a non-200 real status when overriding the body (AC-005)", async () => {
    const fake = new FakeXhr("orig", 503);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [buildRule([{ type: "rewriteBody", body: "new" }])],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(xhr.status).toBe(503);
    expect(xhr.responseText).toBe("new");
  });

  it("should not throw when a remove op targets an absent response header", async () => {
    const fake = new FakeXhr("body", 200, { "x-present": "yes" });
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "modifyResponseHeaders",
              headers: [{ op: "remove", name: "X-Absent" }],
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    expect(() => xhr.send()).not.toThrow();

    await flush();

    expect(xhr.getResponseHeader("x-present")).toBe("yes");
  });

  it("should let rewriteBody contentType win over a set content-type header op (edge case)", async () => {
    const fake = new FakeXhr("orig", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "modifyResponseHeaders",
              headers: [
                { op: "set", name: "content-type", value: "text/plain" },
              ],
            },
            {
              type: "rewriteBody",
              body: '{"x":1}',
              contentType: "application/json",
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(xhr.getResponseHeader("content-type")).toBe("application/json");
  });

  it("should report a served override with kind rewrite, method, url, status, body and request meta", async () => {
    const reports: InterceptReport[] = [];
    const fake = new FakeXhr("orig", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        sink: (report) => reports.push(report),
        getRules: () => [buildRule([{ type: "rewriteBody", body: '{"a":1}' }])],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users");
    xhr.setRequestHeader("X-Env", "staging");
    xhr.send('{"q":1}');

    await flush();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      kind: "rewrite",
      method: "POST",
      url: "https://api.x/users",
      status: 200,
      body: '{"a":1}',
    });
    expect(reports[0].requestHeaders).toMatchObject({ "X-Env": "staging" });
    expect(reports[0].requestBody).toBe('{"q":1}');
  });
});

describe("createPatchedXhr pre-script (AC-008, AC-013)", () => {
  it("should apply pre-script header and body mutations to the delegate before send (AC-008)", async () => {
    // behavior: a pre-script req.setHeader/setBody reaches the delegate ahead of send
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "preScript",
              source:
                'req.setHeader("x-test","1"); req.setBody("{\\"scripted\\":true}");',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users");
    xhr.send('{"orig":true}');

    await flush();

    expect(fake.requestHeaders).toContainEqual({ name: "x-test", value: "1" });
    expect(fake.sent).toEqual(['{"scripted":true}']);
  });

  it("should re-open the delegate with the pre-script url and method before send (AC-008)", async () => {
    // behavior: req.setUrl/setMethod re-opens the delegate; the new open args are recorded
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "preScript",
              source:
                'req.setUrl("https://api.x/rerouted"); req.setMethod("PUT");',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users");
    xhr.send('{"q":1}');

    await flush();

    expect(fake.openArgs.length).toBeGreaterThanOrEqual(2);
    expect(fake.openArgs[fake.openArgs.length - 1]).toEqual({
      method: "PUT",
      url: "https://api.x/rerouted",
    });
    expect(fake.sent).toHaveLength(1);
  });

  it("should re-apply a pre-script header after a setUrl re-open (AC-008)", async () => {
    // behavior: headers set by the script survive the re-open (re-applied to the fresh open)
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "preScript",
              source:
                'req.setHeader("x-token","abc"); req.setUrl("https://api.x/rerouted");',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users");
    xhr.send('{"q":1}');

    await flush();

    expect(fake.requestHeaders).toContainEqual({
      name: "x-token",
      value: "abc",
    });
  });

  it("should run the pre-script after declarative request header ops so it observes the set value (AC-013)", async () => {
    // behavior: modifyRequestHeaders applies before the script, which reads it via req.getHeader
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "modifyRequestHeaders",
              headers: [{ op: "set", name: "X-Env", value: "staging" }],
            },
            {
              type: "preScript",
              source:
                'req.setHeader("x-seen", req.getHeader("x-env") || "MISSING");',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users");
    xhr.send();

    await flush();

    expect(fake.requestHeaders).toContainEqual({
      name: "x-seen",
      value: "staging",
    });
  });

  it("should skip a throwing pre-script but still send and let the post-script run (AC-010)", async () => {
    // behavior: a throwing pre-script is skipped (its header discarded) yet the request
    // still sends and the pipeline reaches the post-script, which rewrites the body -
    // the feature-gated signal that stays RED until scripts are wired.
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "preScript",
              source:
                'req.setHeader("x-partial","1"); throw new Error("pre boom");',
            },
            { type: "postScript", source: 'res.setBody("recovered");' },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users");
    expect(() => xhr.send()).not.toThrow();

    await flush();

    expect(fake.sent).toHaveLength(1);
    expect(fake.requestHeaders).not.toContainEqual({
      name: "x-partial",
      value: "1",
    });
    expect(xhr.responseText).toBe("recovered");
  });
});

describe("createPatchedXhr post-script (AC-008)", () => {
  it("should apply post-script body and header mutations on DONE before the caller onload fires (AC-008)", async () => {
    // behavior: the post-script mutates responseText/headers; the caller's onload sees the mutated values
    const fake = new FakeXhr("orig", 200, { "x-real": "yes" });
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "postScript",
              source: 'res.setBody("changed"); res.setHeader("x-post","on");',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    const seen: { body?: string; header?: string | null } = {};
    xhr.onload = (): void => {
      seen.body = xhr.responseText;
      seen.header = xhr.getResponseHeader("x-post");
    };
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(seen.body).toBe("changed");
    expect(seen.header).toBe("on");
    expect(xhr.responseText).toBe("changed");
    expect(xhr.getResponseHeader("x-post")).toBe("on");
  });

  it("should preserve the original status while the post-script reads it via getStatus (AC-008)", async () => {
    // behavior: getStatus reflects the real status; the exposed status is unchanged
    const fake = new FakeXhr("orig", 503);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "postScript",
              source: 'res.setHeader("x-status", String(res.getStatus()));',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(xhr.status).toBe(503);
    expect(xhr.getResponseHeader("x-status")).toBe("503");
  });

  it("should force the override path for a post-script-only rule so the script sees the real body (AC-008)", async () => {
    // behavior: a response-only post-script reads + rewrites the real body
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "postScript",
              source: 'res.setBody(res.getBody() + "-seen");',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(xhr.responseText).toBe("real-body-seen");
  });

  it("should force the override path yet discard a throwing post-script effect (AC-010)", async () => {
    // behavior: a throwing post-script forces the override path (sink fires - the
    // feature-gated signal) but its partial body mutation is discarded (text stays real).
    // A pre-feature passthrough would neither fire the sink nor force the override path.
    const reports: InterceptReport[] = [];
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        sink: (report) => reports.push(report),
        getRules: () => [
          buildRule([
            {
              type: "postScript",
              source: 'res.setBody("half"); throw new Error("post boom");',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    expect(() => xhr.send()).not.toThrow();

    await flush();

    expect(reports).toHaveLength(1);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe("real-body");
  });

  it("should discard a throwing post-script header mutation, not just its body (AC-010)", async () => {
    // behavior: a header set/removed before the throw must not leak into the served
    // response - the whole script effect is discarded, headers included.
    const fake = new FakeXhr("real-body", 200, { "x-real": "yes" });
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            {
              type: "postScript",
              source:
                'res.setHeader("x-leak","1"); res.removeHeader("x-real"); throw new Error("post boom");',
            },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users");
    xhr.send();

    await flush();

    expect(xhr.getResponseHeader("x-leak")).toBeNull();
    expect(xhr.getResponseHeader("x-real")).toBe("yes");
  });
});

describe("createPatchedXhr url rewrite (AC-005, AC-006)", () => {
  it("should re-open the delegate to the resolved new url while exposing the original response (TC-012)", async () => {
    // behavior: an origin-swap rewrite re-opens the delegate to the new url and passes the real response through
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            { type: "rewriteRequestUrl", target: "http://localhost:3000" },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("GET", "https://api.x/users?page=2");
    xhr.send();

    await flush();

    expect(fake.openArgs[fake.openArgs.length - 1]).toEqual({
      method: "GET",
      url: "http://localhost:3000/users?page=2",
    });
    expect(fake.sent).toHaveLength(1);
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe("real-body");
  });

  it("should re-apply the recorded request headers after re-opening to the rewritten url (TC-012)", async () => {
    // behavior: a re-open resets delegate headers, so recorded request headers are re-applied
    const fake = new FakeXhr("real-body", 200);
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr: xhrClassReturning(fake),
        getRules: () => [
          buildRule([
            { type: "rewriteRequestUrl", target: "http://localhost:3000/mock" },
          ]),
        ],
      }),
    );

    const xhr = new Patched();
    xhr.open("POST", "https://api.x/users?page=2");
    xhr.setRequestHeader("X-Token", "abc");
    xhr.send('{"q":1}');

    await flush();

    expect(fake.openArgs[fake.openArgs.length - 1]).toEqual({
      method: "POST",
      url: "http://localhost:3000/mock?page=2",
    });
    expect(fake.requestHeaders).toContainEqual({
      name: "X-Token",
      value: "abc",
    });
    expect(fake.sent).toEqual(['{"q":1}']);
  });
});

describe("createPatchedXhr script re-entrancy (AC-009)", () => {
  it("should pass an inner XHR opened+sent from a pre-script through without re-running the rule (AC-009)", async () => {
    // behavior: while a script runs, the guard makes an inner XHR pass through
    // un-intercepted, so no rule/script re-runs and there is no recursion.
    const fakes: FakeXhr[] = [];
    const OriginalXhr = class {
      constructor() {
        const fake = new FakeXhr("real-body", 200);
        fakes.push(fake);
        return fake;
      }
    } as unknown as typeof XMLHttpRequest;
    const Patched = createPatchedXhr(
      createDeps({
        OriginalXhr,
        getRules: () => [
          buildRule([
            {
              type: "preScript",
              source:
                'const inner = new XMLHttpRequest(); inner.open("GET","https://api.x/inner"); inner.send();',
            },
          ]),
        ],
      }),
    );
    const previousXhr = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = Patched;

    try {
      const xhr = new Patched();
      xhr.open("GET", "https://api.x/users");
      expect(() => xhr.send()).not.toThrow();

      await flush();

      // one outer delegate + one inner delegate = 2 real XHRs, no runaway recursion.
      expect(fakes.length).toBeGreaterThanOrEqual(2);
      expect(fakes.every((f) => f.sent.length <= 1)).toBe(true);
    } finally {
      globalThis.XMLHttpRequest = previousXhr;
    }
  });
});
