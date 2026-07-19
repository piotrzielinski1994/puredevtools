import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import type { Diagnostic } from '@codemirror/lint';

const PARSE_TIMEOUT_MS = 1000;

export const jsSyntaxLinter =
  () =>
  (view: EditorView): Diagnostic[] => {
    const doc = view.state.doc;
    if (doc.toString().trim() === '') return [];
    const tree = ensureSyntaxTree(view.state, doc.length, PARSE_TIMEOUT_MS);
    if (!tree) return [];
    const diagnostics: Diagnostic[] = [];
    tree.iterate({
      enter: (node) => {
        if (!node.type.isError) return;
        const from = node.from;
        const to = node.to > node.from ? node.to : Math.min(from + 1, doc.length);
        diagnostics.push({ from, to, severity: 'error', message: 'Syntax error' });
      },
    });
    return diagnostics;
  };
