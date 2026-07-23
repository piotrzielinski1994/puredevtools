import { describe, expect, it } from "vitest";
import type { CookieFolderNode, CookieMapping, CookieTreeNode } from "./model";
import {
  duplicateNode,
  flatten,
  migrateLegacy,
  moveNode,
  toggleCollapse,
  updateMappingInTree,
  walkMappingIds,
} from "./tree";

const mapping = (over: Partial<CookieMapping> = {}): CookieMapping => ({
  id: "cm1",
  name: "prod -> local",
  enabled: true,
  sourceUrl: "https://app.prod.com",
  targetUrl: "http://localhost:3000",
  cookieNames: ["auth"],
  ...over,
});

const mappingNode = (over: Partial<CookieMapping> = {}): CookieTreeNode => ({
  kind: "mapping",
  mapping: mapping(over),
});

const folder = (
  id: string,
  children: CookieTreeNode[] = [],
  over: Partial<CookieFolderNode> = {},
): CookieFolderNode => ({
  kind: "folder",
  id,
  name: id,
  collapsed: false,
  children,
  ...over,
});

const rootIds = (tree: CookieTreeNode[]): string[] =>
  tree.map((node) => (node.kind === "mapping" ? node.mapping.id : node.id));

const childrenOf = (node: CookieTreeNode | undefined): CookieTreeNode[] =>
  node && node.kind === "folder" ? node.children : [];

describe("flatten", () => {
  it("should return mappings in DFS pre-order across nested folders", () => {
    const tree = [
      folder("f", [
        mappingNode({ id: "cm1" }),
        folder("g", [mappingNode({ id: "cm2" })]),
      ]),
      mappingNode({ id: "cm3" }),
    ];
    expect(flatten(tree).map((m) => m.id)).toEqual(["cm1", "cm2", "cm3"]);
  });
});

describe("migrateLegacy", () => {
  it("should wrap each flat mapping as a root mapping node", () => {
    expect(
      migrateLegacy([mapping({ id: "cm1" }), mapping({ id: "cm2" })]),
    ).toEqual([
      { kind: "mapping", mapping: mapping({ id: "cm1" }) },
      { kind: "mapping", mapping: mapping({ id: "cm2" }) },
    ]);
  });
});

describe("updateMappingInTree", () => {
  it("should replace the matching mapping deep in the tree", () => {
    const tree = [folder("f", [mappingNode({ id: "cm1", name: "old" })])];
    const result = updateMappingInTree(
      tree,
      mapping({ id: "cm1", name: "new" }),
    );
    expect(flatten(result)[0].name).toBe("new");
  });
});

describe("toggleCollapse", () => {
  it("should flip the collapsed flag of a folder", () => {
    const result = toggleCollapse([folder("f")], "f");
    expect(result[0].kind === "folder" ? result[0].collapsed : null).toBe(true);
  });
});

describe("moveNode", () => {
  it("should move a mapping into a folder", () => {
    const tree = [folder("f"), mappingNode({ id: "cm1" })];
    const result = moveNode(tree, "cm1", { parentId: "f", index: 0 });
    expect(rootIds(result)).toEqual(["f"]);
    expect(
      childrenOf(result[0]).map((n) =>
        n.kind === "mapping" ? n.mapping.id : n.id,
      ),
    ).toEqual(["cm1"]);
  });
});

describe("duplicateNode", () => {
  it("should duplicate a mapping with a fresh id and (copy) name as a sibling", () => {
    const result = duplicateNode(
      [mappingNode({ id: "cm1", name: "auth" })],
      "cm1",
    );
    expect(result).toHaveLength(2);
    const clone = result[1];
    expect(clone.kind === "mapping" ? clone.mapping.name : null).toBe(
      "auth (copy)",
    );
    expect(clone.kind === "mapping" ? clone.mapping.id : null).not.toBe("cm1");
  });

  it("should deep-clone a folder subtree with fresh ids and (copy) on the top only", () => {
    const tree = [
      folder("folder-1", [mappingNode({ id: "cm1", name: "keep" })], {
        name: "env",
      }),
    ];
    const result = duplicateNode(tree, "folder-1");
    const clone = result[1];
    expect(clone.kind === "folder" ? clone.name : null).toBe("env (copy)");
    const child = childrenOf(clone)[0];
    expect(child && child.kind === "mapping" ? child.mapping.name : null).toBe(
      "keep",
    );
    expect(
      child && child.kind === "mapping" ? child.mapping.id : null,
    ).not.toBe("cm1");
    const allIds = [...walkMappingIds(result)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("should not mutate the original when the clone is changed", () => {
    const tree = [mappingNode({ id: "cm1" })];
    const result = duplicateNode(tree, "cm1");
    const clone = result[1];
    if (clone.kind === "mapping") clone.mapping.cookieNames.push("extra");
    const original = result[0];
    expect(
      original.kind === "mapping" ? original.mapping.cookieNames : null,
    ).toEqual(["auth"]);
  });
});
