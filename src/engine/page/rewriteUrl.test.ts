import { describe, expect, it } from "vitest";
import { resolveRewrite } from "./rewriteUrl";

describe("resolveRewrite (AC-002)", () => {
  it("should swap only scheme/host/port and keep the original path and query for an origin-only target (TC-001)", () => {
    // behavior: origin-only target -> keep original path+query, replace origin
    expect(
      resolveRewrite(
        "https://api.prod.com/users/1?x=2",
        "http://localhost:3000",
      ),
    ).toBe("http://localhost:3000/users/1?x=2");
  });

  it("should keep the original hash as well as the path and query on an origin swap (TC-001)", () => {
    // behavior: origin swap preserves the full path+query+hash triple
    expect(
      resolveRewrite(
        "https://api.prod.com/users/1?x=2#frag",
        "http://localhost:3000",
      ),
    ).toBe("http://localhost:3000/users/1?x=2#frag");
  });

  it("should full-replace the path while preserving the original query when the target omits one (TC-002)", () => {
    // behavior: explicit target path replaces the path; original query backfilled
    expect(
      resolveRewrite(
        "https://api.prod.com/users/1?x=2",
        "http://localhost:3000/mock",
      ),
    ).toBe("http://localhost:3000/mock?x=2");
  });

  it("should preserve the original hash on a full replace when the target omits it (TC-002)", () => {
    // behavior: original hash backfilled on full replace when target has none
    expect(
      resolveRewrite(
        "https://api.prod.com/users/1?x=2#frag",
        "http://localhost:3000/mock",
      ),
    ).toBe("http://localhost:3000/mock?x=2#frag");
  });

  it("should treat a trailing-slash origin as an origin swap, not a full replace (TC-003)", () => {
    // behavior: http://host:port/ is still origin-only -> swap keeps original path/query
    expect(
      resolveRewrite(
        "https://api.prod.com/users/1?x=2",
        "http://localhost:3000/",
      ),
    ).toBe("http://localhost:3000/users/1?x=2");
  });

  it("should let the target query win and drop the original query when the target carries its own (TC-004)", () => {
    // behavior: target query present -> original query discarded
    expect(
      resolveRewrite(
        "https://api.prod.com/users/1?x=2",
        "http://localhost:3000/mock?y=9",
      ),
    ).toBe("http://localhost:3000/mock?y=9");
  });

  it("should return the original url unchanged for an empty target (TC-005)", () => {
    // behavior: empty target is a no-op
    expect(resolveRewrite("https://api.prod.com/users/1?x=2", "")).toBe(
      "https://api.prod.com/users/1?x=2",
    );
  });

  it("should return the original url unchanged for an unparseable target without throwing (TC-005)", () => {
    // behavior: an unparseable target (out-of-range port) is swallowed -> original returned
    expect(() =>
      resolveRewrite(
        "https://api.prod.com/users/1?x=2",
        "http://localhost:99999",
      ),
    ).not.toThrow();
    expect(
      resolveRewrite(
        "https://api.prod.com/users/1?x=2",
        "http://localhost:99999",
      ),
    ).toBe("https://api.prod.com/users/1?x=2");
  });

  it("should full-replace on the same origin for a root-relative target (TC-006)", () => {
    // behavior: /path resolves against the original origin and replaces the path
    expect(resolveRewrite("https://api.prod.com/users/1?x=2", "/mock")).toBe(
      "https://api.prod.com/mock?x=2",
    );
  });

  it("should resolve a protocol-relative target against the original scheme, keeping the path/query (edge, AC-002)", () => {
    // behavior: //host resolves as origin-only against the original scheme -> origin swap
    expect(
      resolveRewrite("https://api.prod.com/users/1?x=2", "//cdn.example.com"),
    ).toBe("https://cdn.example.com/users/1?x=2");
  });
});
