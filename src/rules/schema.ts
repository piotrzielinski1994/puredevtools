import { z } from 'zod';
import type {
  HeaderMatcher,
  HeaderOp,
  HttpMethod,
  Matchers,
  MockAction,
  PatternKind,
  RequestAction,
  ResourceType,
  ResponseAction,
  Rule,
  RuleAction,
} from './model';

const patternKind = z.enum(['glob', 'regex']) satisfies z.ZodType<PatternKind>;

const httpMethod = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]) satisfies z.ZodType<HttpMethod>;

const resourceType = z.enum([
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
]) satisfies z.ZodType<ResourceType>;

const headerMatcher = z.object({
  name: z.string().min(1),
  equals: z.string().optional(),
  contains: z.string().optional(),
}) satisfies z.ZodType<HeaderMatcher>;

const matchers = z.object({
  url: z.object({ pattern: z.string(), kind: patternKind }),
  methods: z.array(httpMethod).optional(),
  resourceTypes: z.array(resourceType).optional(),
  requestHeaders: z.array(headerMatcher).optional(),
}) satisfies z.ZodType<Matchers>;

const headerOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), name: z.string().min(1), value: z.string() }),
  z.object({ op: z.literal('remove'), name: z.string().min(1) }),
]) satisfies z.ZodType<HeaderOp>;

const requestAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('modifyRequestHeaders'), headers: z.array(headerOp) }),
  z.object({ type: z.literal('redirect'), url: z.string().min(1) }),
  z.object({ type: z.literal('block') }),
]) satisfies z.ZodType<RequestAction>;

const responseAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('modifyResponseHeaders'), headers: z.array(headerOp) }),
  z.object({ type: z.literal('setStatus'), status: z.number().int() }),
  z.object({ type: z.literal('rewriteBody'), body: z.string(), contentType: z.string().optional() }),
]) satisfies z.ZodType<ResponseAction>;

const mockAction = z.object({
  type: z.literal('mock'),
  status: z.number().int(),
  headers: z.array(headerOp),
  body: z.string(),
  contentType: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
}) satisfies z.ZodType<MockAction>;

const ruleAction = z.union([
  requestAction,
  responseAction,
  mockAction,
]) satisfies z.ZodType<RuleAction>;

export const ruleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  matchers,
  actions: z.array(ruleAction),
}) satisfies z.ZodType<Rule>;

export const portableSchema = z
  .object({
    version: z.number().int(),
    globalEnabled: z.boolean(),
    rules: z.array(ruleSchema),
  })
  .refine((state) => new Set(state.rules.map((rule) => rule.id)).size === state.rules.length, {
    message: 'Duplicate rule ids are not allowed.',
  });

export type PortableState = z.infer<typeof portableSchema>;
