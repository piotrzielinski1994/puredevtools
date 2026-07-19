import { Linter } from 'eslint-linter-browserify';
import type { EditorView } from '@codemirror/view';
import type { Diagnostic } from '@codemirror/lint';
import type { ScriptStage } from './model';

const linter = new Linter();

const globalsFor = (stage: ScriptStage): Record<string, 'readonly'> => {
  const shared = { console: 'readonly', req: 'readonly' } as const;
  if (stage === 'post') return { ...shared, res: 'readonly' };
  return shared;
};

export const jsUndefLinter =
  (stage: ScriptStage) =>
  (view: EditorView): Diagnostic[] => {
    const doc = view.state.doc;
    const code = doc.toString();
    if (code.trim() === '') return [];
    const messages = linter.verify(code, {
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: globalsFor(stage),
      },
      rules: { 'no-undef': 'error' },
    });
    return messages.map((message) => {
      const from = doc.line(message.line).from + (message.column - 1);
      const to =
        message.endLine !== undefined && message.endColumn !== undefined
          ? doc.line(message.endLine).from + (message.endColumn - 1)
          : Math.min(from + 1, doc.length);
      return {
        from: Math.min(from, doc.length),
        to: Math.min(Math.max(to, from + 1), doc.length),
        severity: 'error',
        message: message.message,
      };
    });
  };
