import type { CompletionContext } from "@codemirror/autocomplete";
import { describe, expect, it } from "vitest";
import { apiMembers, scriptApiCompletion } from "./script-api-complete";

const contextFor = (text: string, explicit = false): CompletionContext =>
  ({
    explicit,
    matchBefore: (re: RegExp) => {
      const match = text.match(new RegExp(`${re.source}$`));
      if (!match) return null;
      return {
        from: text.length - match[0].length,
        to: text.length,
        text: match[0],
      };
    },
  }) as unknown as CompletionContext;

const REQ_FULL = [
  "getUrl",
  "setUrl",
  "getMethod",
  "setMethod",
  "getHeader",
  "setHeader",
  "removeHeader",
  "getHeaders",
  "getBody",
  "setBody",
];

const REQ_READONLY = [
  "getUrl",
  "getMethod",
  "getHeader",
  "getHeaders",
  "getBody",
];

const RES_MEMBERS = [
  "getStatus",
  "getHeader",
  "setHeader",
  "removeHeader",
  "getHeaders",
  "getBody",
  "setBody",
  "getJson",
];

describe("apiMembers (AC-012)", () => {
  it("should list the full req read+write set in the pre stage", () => {
    // behavior: a pre-script sees every request getter and setter
    const members = apiMembers("req", "pre");

    REQ_FULL.forEach((name) => {
      expect(members).toContain(name);
    });
  });

  it("should include removeHeader and the setters in the pre stage req set", () => {
    // behavior: mutating members belong to the pre stage
    const members = apiMembers("req", "pre");

    expect(members).toContain("setUrl");
    expect(members).toContain("setMethod");
    expect(members).toContain("setHeader");
    expect(members).toContain("removeHeader");
    expect(members).toContain("setBody");
  });

  it("should list only the read-only req getters in the post stage", () => {
    // behavior: a post-script reads the sent request but cannot mutate it
    const members = apiMembers("req", "post");

    REQ_READONLY.forEach((name) => {
      expect(members).toContain(name);
    });
    expect(members).not.toContain("setUrl");
    expect(members).not.toContain("setMethod");
    expect(members).not.toContain("setHeader");
    expect(members).not.toContain("setBody");
    expect(members).not.toContain("removeHeader");
  });

  it("should list the response members in the post stage", () => {
    // behavior: the res facade members are available in post
    const members = apiMembers("res", "post");

    RES_MEMBERS.forEach((name) => {
      expect(members).toContain(name);
    });
  });

  it("should not offer setStatus among the response members", () => {
    // behavior: status is read-only, so no setStatus completion exists
    expect(apiMembers("res", "post")).not.toContain("setStatus");
  });

  it("should return an empty list for res in the pre stage", () => {
    // behavior: res does not exist before the response arrives
    expect(apiMembers("res", "pre")).toEqual([]);
  });

  it("should list the console methods in either stage", () => {
    // behavior: console is available in both stages
    expect(apiMembers("console", "pre")).toEqual([
      "log",
      "info",
      "warn",
      "error",
    ]);
    expect(apiMembers("console", "post")).toEqual([
      "log",
      "info",
      "warn",
      "error",
    ]);
  });

  it("should return an empty list for an unknown object", () => {
    // behavior: an unrecognized namespace yields no members
    expect(apiMembers("window", "pre")).toEqual([]);
    expect(apiMembers("purerequest", "pre")).toEqual([]);
  });
});

describe("scriptApiCompletion (AC-012)", () => {
  it("should return a completion source function for a stage", () => {
    // behavior: the export is a CodeMirror CompletionSource (a function)
    expect(typeof scriptApiCompletion("pre")).toBe("function");
    expect(typeof scriptApiCompletion("post")).toBe("function");
  });

  it('should complete req member methods after "req." in the pre stage', () => {
    // behavior: a member completion offers the stage-aware method list, anchored after the dot
    const result = scriptApiCompletion("pre")(contextFor("req."));

    expect(result).not.toBeNull();
    const labels = result?.options.map((option) => option.label);
    expect(labels).toContain("setHeader");
    expect(labels).toContain("setUrl");
    expect(result?.from).toBe("req.".length);
  });

  it("should not complete res members in the pre stage (empty member set -> null)", () => {
    // behavior: res has no members before the response, so member completion bails out
    expect(scriptApiCompletion("pre")(contextFor("res."))).toBeNull();
  });

  it('should complete res member methods after "res." in the post stage', () => {
    const result = scriptApiCompletion("post")(contextFor("res."));

    expect(result).not.toBeNull();
    expect(result?.options.map((option) => option.label)).toContain("getJson");
  });

  it("should offer the top-level namespaces for a bare word, stage-aware", () => {
    // behavior: at a bare identifier the source lists the stage's namespaces
    const pre = scriptApiCompletion("pre")(contextFor("re"));
    const post = scriptApiCompletion("post")(contextFor("re"));

    expect(pre?.options.map((option) => option.label)).toEqual([
      "req",
      "console",
    ]);
    expect(post?.options.map((option) => option.label)).toEqual([
      "req",
      "res",
      "console",
    ]);
  });

  it("should return null at an empty position without an explicit request", () => {
    // behavior: no implicit completion on empty input
    expect(scriptApiCompletion("pre")(contextFor(""))).toBeNull();
  });
});
