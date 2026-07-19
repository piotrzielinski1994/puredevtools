// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { jsSyntaxLinter } from './script-lint';

const viewOf = (doc: string): EditorView => {
  const state = EditorState.create({ doc, extensions: [javascript()] });
  return new EditorView({ state });
};

describe('jsSyntaxLinter (AC-012)', () => {
  it('should return no diagnostics for an empty document', () => {
    // behavior: whitespace-only code is not linted
    expect(jsSyntaxLinter()(viewOf('   \n'))).toEqual([]);
  });

  it('should return no diagnostics for valid javascript', () => {
    // behavior: a well-formed script parses without error nodes
    expect(jsSyntaxLinter()(viewOf('req.setHeader("x", "1");'))).toEqual([]);
  });

  it('should flag an unclosed brace as a syntax error', () => {
    // behavior: a parse-tree error node yields an error diagnostic
    const diagnostics = jsSyntaxLinter()(viewOf('function f() {'));

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toBe('Syntax error');
  });

  it('should map a diagnostic to a range within the document bounds', () => {
    // behavior: diagnostic offsets stay inside the document
    const view = viewOf('const x = ;');

    const diagnostics = jsSyntaxLinter()(view);

    expect(diagnostics.length).toBeGreaterThan(0);
    diagnostics.forEach((d) => {
      expect(d.from).toBeGreaterThanOrEqual(0);
      expect(d.to).toBeLessThanOrEqual(view.state.doc.length);
      expect(d.from).toBeLessThanOrEqual(d.to);
    });
  });
});
