import { z } from 'zod';
import type {
  HeaderOp,
  HttpMethod,
  Matchers,
  PatternKind,
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

const matchers = z
  .object({
    url: z.object({ pattern: z.string(), kind: patternKind }),
    methods: z.array(httpMethod).optional(),
  })
  .strict() satisfies z.ZodType<Matchers>;

const headerOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), name: z.string().min(1), value: z.string() }),
  z.object({ op: z.literal('remove'), name: z.string().min(1) }),
]) satisfies z.ZodType<HeaderOp>;

const ruleAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('modifyResponseHeaders'), headers: z.array(headerOp) }),
  z.object({ type: z.literal('rewriteBody'), body: z.string(), contentType: z.string().optional() }),
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
