import { parse } from 'espree';
import { analyze, type Scope, type Reference } from 'eslint-scope';
import globals from 'globals';
import type { Program } from 'estree';
import type { EditorView } from '@codemirror/view';
import type { Diagnostic } from '@codemirror/lint';
import type { ScriptStage } from './model';

const ECMA_VERSION = 2022;

const knownGlobalsFor = (stage: ScriptStage): ReadonlySet<string> => {
  const stageGlobals = stage === 'post' ? ['console', 'req', 'res'] : ['console', 'req'];
  return new Set([...Object.keys(globals.builtin), ...stageGlobals]);
};

const unresolvedReferences = (scope: Scope): Reference[] => [
  ...scope.through,
  ...scope.childScopes.flatMap(unresolvedReferences),
];

export const jsUndefLinter =
  (stage: ScriptStage) =>
  (view: EditorView): Diagnostic[] => {
    const doc = view.state.doc;
    const code = doc.toString();
    if (code.trim() === '') return [];

    const known = knownGlobalsFor(stage);
    const ast = parseOrNull(code);
    if (ast === null) return [];

    const scopeManager = analyze(ast, { ecmaVersion: ECMA_VERSION, sourceType: 'module' });
    if (scopeManager.globalScope === null) return [];
    const undefinedRefs = unresolvedReferences(scopeManager.globalScope).filter(
      (reference) => !known.has(reference.identifier.name),
    );

    return undefinedRefs.map((reference) => {
      const { name, loc } = reference.identifier;
      const from = loc ? doc.line(loc.start.line).from + loc.start.column : 0;
      const to = loc ? doc.line(loc.end.line).from + loc.end.column : from + 1;
      return {
        from: Math.min(from, doc.length),
        to: Math.min(Math.max(to, from + 1), doc.length),
        severity: 'error',
        message: `'${name}' is not defined.`,
      };
    });
  };

const parseOrNull = (code: string): Program | null => {
  try {
    return parse(code, { ecmaVersion: ECMA_VERSION, sourceType: 'module', loc: true }) as unknown as Program;
  } catch {
    return null;
  }
};
