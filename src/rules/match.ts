import type { Matchers, PatternKind, Rule, RequestDescriptor } from './model';

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

export const matchesRequest = (rule: Rule, request: RequestDescriptor): MatchResult => {
  const url = matchUrl(rule.matchers.url.pattern, rule.matchers.url.kind, request.url);
  if (!url.ok) return url;
  if (!url.matched) return { ok: true, matched: false };

  return { ok: true, matched: matchesMethod(rule.matchers.methods, request.method) };
};
