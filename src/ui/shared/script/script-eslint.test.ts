// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { jsUndefLinter } from './script-eslint';

const viewOf = (doc: string): EditorView => {
  const state = EditorState.create({ doc });
  return new EditorView({ state });
};

describe('jsUndefLinter (AC-012)', () => {
  it('should return no diagnostics for an empty document', () => {
    // behavior: whitespace-only code is not linted
    expect(jsUndefLinter('pre')(viewOf('  \n '))).toEqual([]);
  });

  it('should flag an assignment to an undeclared variable', () => {
    // behavior: no-undef fires on an undeclared global assignment
    const diagnostics = jsUndefLinter('pre')(viewOf('csd = 2;'));

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toContain('csd');
    expect(diagnostics[0].severity).toBe('error');
  });

  it('should flag a call to an undefined function', () => {
    // behavior: no-undef fires on an unknown call (an API typo)
    expect(jsUndefLinter('pre')(viewOf('nope();')).length).toBeGreaterThan(0);
  });

  it('should not flag the req and console globals in the pre stage', () => {
    // behavior: pre-stage globals are known, so no-undef stays silent
    expect(jsUndefLinter('pre')(viewOf('req.getUrl(); console.log("x");'))).toEqual([]);
  });

  it('should not flag the res and console globals in the post stage', () => {
    // behavior: post-stage globals are known
    expect(jsUndefLinter('post')(viewOf('res.getStatus(); console.log("x");'))).toEqual([]);
  });

  it('should flag res in a pre script but not in a post script (stage-aware globals)', () => {
    // behavior: res is post-only, so referencing it in a pre script is undefined
    const view = viewOf('res.getStatus();');

    expect(jsUndefLinter('post')(view)).toEqual([]);
    expect(jsUndefLinter('pre')(view).length).toBeGreaterThan(0);
  });

  it('should not flag standard ES builtins', () => {
    // behavior: JSON/Math/Promise/String are known ES globals
    const view = viewOf('JSON.stringify({}); Math.max(1,2); const p = Promise.resolve(); String(1);');

    expect(jsUndefLinter('pre')(view)).toEqual([]);
  });

  it('should support async/await syntax without a parse error', () => {
    // behavior: the linter accepts top-level await used by scripts
    expect(jsUndefLinter('pre')(viewOf('await Promise.resolve(); req.getUrl();'))).toEqual([]);
  });

  it('should map a diagnostic to a valid range within the doc', () => {
    // behavior: diagnostic offsets stay inside the document bounds
    const view = viewOf('csd = 2;');

    const [d] = jsUndefLinter('pre')(view);

    expect(d.from).toBeGreaterThanOrEqual(0);
    expect(d.to).toBeLessThanOrEqual(view.state.doc.length);
    expect(d.from).toBeLessThan(d.to);
  });
});
