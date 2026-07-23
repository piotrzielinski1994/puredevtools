import { z } from "zod";
import type {
  FolderNode,
  HeaderOp,
  HttpMethod,
  Matchers,
  PatternKind,
  Rule,
  RuleAction,
  RuleNode,
  TreeNode,
} from "./model";
import { walkRuleIds } from "./tree";

const patternKind = z.enum(["glob", "regex"]) satisfies z.ZodType<PatternKind>;

const httpMethod = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]) satisfies z.ZodType<HttpMethod>;

const matchers = z
  .object({
    url: z.object({ pattern: z.string(), kind: patternKind }),
    methods: z.array(httpMethod).optional(),
  })
  .strict() satisfies z.ZodType<Matchers>;

const headerOp = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set"),
    name: z.string().min(1),
    value: z.string(),
  }),
  z.object({ op: z.literal("remove"), name: z.string().min(1) }),
]) satisfies z.ZodType<HeaderOp>;

const ruleAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("modifyResponseHeaders"),
    headers: z.array(headerOp),
  }),
  z.object({
    type: z.literal("rewriteBody"),
    body: z.string(),
    contentType: z.string().optional(),
  }),
  z.object({
    type: z.literal("modifyRequestHeaders"),
    headers: z.array(headerOp),
  }),
  z.object({ type: z.literal("rewriteRequestBody"), body: z.string() }),
  z.object({ type: z.literal("rewriteRequestUrl"), target: z.string() }),
  z.object({ type: z.literal("preScript"), source: z.string() }),
  z.object({ type: z.literal("postScript"), source: z.string() }),
]) satisfies z.ZodType<RuleAction>;

export const ruleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    enabled: z.boolean(),
    matchers,
    actions: z.array(ruleAction),
  })
  .strict() satisfies z.ZodType<Rule>;

const ruleNodeSchema = z
  .object({ kind: z.literal("rule"), rule: ruleSchema })
  .strict() satisfies z.ZodType<RuleNode>;

const folderNodeSchema: z.ZodType<FolderNode> = z.lazy(() =>
  z
    .object({
      kind: z.literal("folder"),
      id: z.string().min(1),
      name: z.string(),
      collapsed: z.boolean(),
      children: z.array(treeNodeSchema),
    })
    .strict(),
);

const treeNodeSchema: z.ZodType<TreeNode> = z.union([
  ruleNodeSchema,
  folderNodeSchema,
]);

export const workspaceSchema = z.array(treeNodeSchema);

export const portableSchema = z
  .object({
    enabled: z.boolean(),
    workspace: workspaceSchema,
  })
  .refine(
    (state) => {
      const ids = walkRuleIds(state.workspace);
      return new Set(ids).size === ids.length;
    },
    { message: "Duplicate rule ids are not allowed." },
  );

export type PortableState = z.infer<typeof portableSchema>;
