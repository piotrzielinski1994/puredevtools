import type { HeaderMatcher, Matchers, PatternKind, Rule, RequestDescriptor } from './model';

export type MatchResult =
  | { ok: true; matched: boolean }
  | { ok: false; error: string };

const GLOB_SPECIAL = /[.*+?^${}()|[\]\\]/g;

export const globToRegExp = (pattern: string): RegExp => {
  const body = pattern
    .replace(GLOB_SPECIAL, (char) => `\\${char}`)
    .replace(/\\\*/g, '.*')
    .replace(/\\\?/g, '.');
  return new RegExp(`^${body}$`);
};

const compile = (pattern: string, kind: PatternKind): RegExp =>
  kind === 'glob' ? globToRegExp(pattern) : new RegExp(pattern);

export const matchUrl = (pattern: string, kind: PatternKind, url: string): MatchResult => {
  if (pattern === '') return { ok: true, matched: true };
  try {
    return { ok: true, matched: compile(pattern, kind).test(url) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const matchesMethod = (methods: Matchers['methods'], method: string): boolean => {
  if (!methods || methods.length === 0) return true;
  return methods.some((candidate) => candidate.toLowerCase() === method.toLowerCase());
};

const matchesResourceType = (
  resourceTypes: Matchers['resourceTypes'],
  resourceType: RequestDescriptor['resourceType'],
): boolean => {
  if (!resourceTypes || resourceTypes.length === 0) return true;
  return resourceTypes.includes(resourceType);
};

const matchesHeader = (matcher: HeaderMatcher, headers: Record<string, string>): boolean => {
  const target = matcher.name.toLowerCase();
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === target);
  if (!entry) return false;
  const value = entry[1];
  if (matcher.equals !== undefined) return value === matcher.equals;
  if (matcher.contains !== undefined) return value.includes(matcher.contains);
  return true;
};

const matchesHeaders = (
  matchers: Matchers['requestHeaders'],
  headers: RequestDescriptor['requestHeaders'],
): boolean => {
  if (!matchers || matchers.length === 0) return true;
  return matchers.every((matcher) => matchesHeader(matcher, headers ?? {}));
};

export const matchesRequest = (rule: Rule, request: RequestDescriptor): MatchResult => {
  const url = matchUrl(rule.matchers.url.pattern, rule.matchers.url.kind, request.url);
  if (!url.ok) return url;
  if (!url.matched) return { ok: true, matched: false };

  const matched =
    matchesMethod(rule.matchers.methods, request.method) &&
    matchesResourceType(rule.matchers.resourceTypes, request.resourceType) &&
    matchesHeaders(rule.matchers.requestHeaders, request.requestHeaders);

  return { ok: true, matched };
};
