import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { linter, lintGutter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import type { ScriptStage } from './script/model';
import { scriptApiCompletion } from './script/script-api-complete';
import { jsSyntaxLinter } from './script/script-lint';
import { jsUndefLinter } from './script/script-eslint';

export type ScriptEditorProps = {
  value: string;
  stage: ScriptStage;
  ariaLabel: string;
  onChange(value: string): void;
};

export const ScriptEditor = ({ value, stage, ariaLabel, onChange }: ScriptEditorProps) => {
  const extensions = useMemo(
    () => [
      javascript(),
      closeBrackets(),
      autocompletion({ override: [scriptApiCompletion(stage)] }),
      linter((view) => [...jsSyntaxLinter()(view), ...jsUndefLinter(stage)(view)]),
      lintGutter(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
    ],
    [stage, ariaLabel],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme="none"
      height="200px"
      className="border border-border font-mono text-sm"
      basicSetup={{ lineNumbers: false, foldGutter: false }}
      extensions={extensions}
    />
  );
};
