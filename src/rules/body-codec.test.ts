import { describe, expect, it } from "vitest";
import { bodyToDisk, diskToBody } from "./body-codec";

describe("bodyToDisk", () => {
  it("should convert a JSON object body to its parsed value", () => {
    expect(bodyToDisk('{"a":1}')).toEqual({ a: 1 });
  });

  it("should convert a JSON array body to its parsed value", () => {
    expect(bodyToDisk("[1,2]")).toEqual([1, 2]);
  });

  it("should keep a plain-text body as a verbatim string", () => {
    expect(bodyToDisk("hello")).toBe("hello");
  });

  it("should keep a JSON scalar body as a verbatim string", () => {
    expect(bodyToDisk("42")).toBe("42");
    expect(bodyToDisk('"quoted"')).toBe('"quoted"');
  });

  it("should keep an empty body as an empty string", () => {
    expect(bodyToDisk("")).toBe("");
  });

  it("should keep a malformed JSON-looking body as a verbatim string", () => {
    expect(bodyToDisk("{not json")).toBe("{not json");
  });
});

describe("diskToBody", () => {
  it("should pretty-print an object value to a string", () => {
    expect(diskToBody({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it("should pretty-print an array value to a string", () => {
    expect(diskToBody([1, 2])).toBe(JSON.stringify([1, 2], null, 2));
  });

  it("should return a string value verbatim", () => {
    expect(diskToBody("hello")).toBe("hello");
  });

  it("should return an empty string for null or undefined", () => {
    expect(diskToBody(null)).toBe("");
    expect(diskToBody(undefined)).toBe("");
  });
});

describe("bodyToDisk -> diskToBody round-trip", () => {
  it("should restore a pretty-printed JSON object body", () => {
    const body = JSON.stringify({ makes: [{ id: 1 }] }, null, 2);
    expect(diskToBody(bodyToDisk(body))).toBe(body);
  });
});
