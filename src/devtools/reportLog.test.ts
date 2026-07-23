import { describe, expect, it } from "vitest";
import type { InterceptReport } from "../engine/page/types";
import { emptyLog, MAX_ENTRIES, reduceLog } from "./reportLog";
import type { LogState } from "./types";

const buildReport = (
  overrides: Partial<InterceptReport> = {},
): InterceptReport => ({
  kind: "rewrite",
  method: "GET",
  url: "https://api.example.com/users",
  status: 200,
  body: '{"ok":true}',
  ...overrides,
});

describe("emptyLog", () => {
  it("should return an empty entries array with nextId 1", () => {
    const state = emptyLog();
    expect(state.entries).toEqual([]);
    expect(state.nextId).toBe(1);
  });
});

describe("reduceLog", () => {
  it("should append an entry carrying the report fields with a monotonic id starting at 1 (TC-004)", () => {
    const report = buildReport({
      kind: "rewrite",
      method: "POST",
      url: "https://x/y",
      status: 418,
      body: "hi",
    });
    const afterFirst = reduceLog(emptyLog(), { type: "report", report });

    expect(afterFirst.entries).toHaveLength(1);
    expect(afterFirst.entries[0].id).toBe(1);
    expect(afterFirst.entries[0]).toMatchObject({
      kind: "rewrite",
      method: "POST",
      url: "https://x/y",
      status: 418,
      body: "hi",
    });

    const afterSecond = reduceLog(afterFirst, {
      type: "report",
      report: buildReport(),
    });
    const ids = afterSecond.entries.map((entry) => entry.id);
    expect(ids).toContain(2);
    expect(Math.max(...ids)).toBe(2);
  });

  it("should cap entries at MAX_ENTRIES dropping the oldest while keeping the newest (TC-005)", () => {
    const total = MAX_ENTRIES + 5;
    let state: LogState = emptyLog();
    for (let index = 0; index < total; index += 1) {
      state = reduceLog(state, {
        type: "report",
        report: buildReport({ url: `https://x/${index}` }),
      });
    }

    expect(state.entries).toHaveLength(MAX_ENTRIES);

    const ids = state.entries.map((entry) => entry.id);
    expect(Math.min(...ids)).toBeGreaterThan(1);
    expect(ids).toContain(total);
  });

  it("should empty the entries on a clear action (TC-006)", () => {
    const withEntry = reduceLog(emptyLog(), {
      type: "report",
      report: buildReport(),
    });
    const cleared = reduceLog(withEntry, { type: "clear" });
    expect(cleared.entries).toEqual([]);
  });

  it("should not mutate the input state when reducing a report (purity)", () => {
    const original = reduceLog(emptyLog(), {
      type: "report",
      report: buildReport(),
    });
    const lengthBefore = original.entries.length;

    reduceLog(original, { type: "report", report: buildReport() });

    expect(original.entries).toHaveLength(lengthBefore);
  });
});
