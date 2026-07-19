import { useState } from 'react';
import { useHotkeys } from '@tanstack/react-hotkeys';
import { Plus, X } from 'lucide-react';
import type { HttpMethod, PatternKind } from '../../rules/model';
import { matchUrl } from '../../rules/match';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';
import type { OpRow, RuleDraft } from './ruleDraft';

export type RuleFormProps = {
  draft: RuleDraft;
  onDraftChange(draft: RuleDraft): void;
  onSave(): Promise<{ ok: boolean; error?: string }>;
};

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const Field = ({ htmlFor, label, children }: { htmlFor: string; label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
  </div>
);

type FormTab = 'match' | 'request' | 'response';

const FormTabs = ({ active, onSelect }: { active: FormTab; onSelect(tab: FormTab): void }) => {
  const tabs: { key: FormTab; label: string }[] = [
    { key: 'match', label: 'Match' },
    { key: 'request', label: 'Request' },
    { key: 'response', label: 'Response' },
  ];
  return (
    <div role="tablist" className="flex h-9 items-stretch border-b bg-muted/30">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`rule-tab-${tab.key}`}
          aria-selected={active === tab.key}
          aria-controls={`rule-panel-${tab.key}`}
          onClick={() => onSelect(tab.key)}
          className={cn(
            'border-r border-r-border px-3 text-sm font-medium hover:bg-accent',
            active === tab.key
              ? 'bg-accent text-foreground shadow-[inset_0_-1px_0_0_var(--primary)]'
              : 'text-muted-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

const MatchHint = ({ pattern, kind, url }: { pattern: string; kind: PatternKind; url: string }) => {
  const result = matchUrl(pattern, kind, url);
  if (!result.ok) {
    return <p role="status" className="text-xs text-destructive">Invalid pattern: {result.error}</p>;
  }
  return (
    <p role="status" className={`text-xs ${result.matched ? 'text-emerald-600' : 'text-muted-foreground'}`}>
      {result.matched ? '✓ matches' : '✗ does not match'}
    </p>
  );
};

export const RuleForm = ({ draft, onDraftChange, onSave }: RuleFormProps) => {
  const [testUrl, setTestUrl] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<FormTab>('match');

  const patch = (changes: Partial<RuleDraft>) => onDraftChange({ ...draft, ...changes });

  const toggleMethod = (method: HttpMethod) =>
    patch({
      methods: draft.methods.includes(method)
        ? draft.methods.filter((item) => item !== method)
        : [...draft.methods, method],
    });

  const onSubmit = async () => {
    setError(undefined);
    const result = await onSave();
    if (!result.ok) setError(result.error);
  };

  useHotkeys([{ hotkey: 'Mod+S', callback: () => void onSubmit() }]);

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <FormTabs active={activeTab} onSelect={setActiveTab} />

      {activeTab === 'match' ? (
        <div role="tabpanel" id="rule-panel-match" aria-labelledby="rule-tab-match" className="flex flex-col gap-3 p-4">
          <Field htmlFor="rule-name" label="Name">
            <Input id="rule-name" value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="My rule" />
          </Field>

          <div className="flex flex-col gap-1.5">
            <Label>Methods</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {METHODS.map((method) => (
                <label key={method} className="inline-flex items-center gap-1.5 text-sm">
                  <Checkbox checked={draft.methods.includes(method)} onChange={() => toggleMethod(method)} />
                  {method}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Field htmlFor="rule-kind" label="Match kind">
              <Select id="rule-kind" aria-label="Pattern kind" className="w-40" value={draft.kind} onChange={(event) => patch({ kind: event.target.value as PatternKind })}>
                <option value="glob">glob</option>
                <option value="regex">regex</option>
              </Select>
            </Field>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="rule-url">URL</Label>
              <Input id="rule-url" aria-label="URL pattern" className="font-mono" value={draft.pattern} onChange={(event) => patch({ pattern: event.target.value })} placeholder="https://example.com/*" />
            </div>
          </div>

          <Field htmlFor="rule-test-url" label="Try a URL against this rule">
            <Input
              id="rule-test-url"
              aria-label="Test URL"
              className="font-mono"
              value={testUrl}
              onChange={(event) => setTestUrl(event.target.value)}
              placeholder="https://example.com/path"
            />
            {testUrl.trim() !== '' ? <MatchHint pattern={draft.pattern} kind={draft.kind} url={testUrl} /> : null}
          </Field>
        </div>
      ) : activeTab === 'request' ? (
        <div role="tabpanel" id="rule-panel-request" aria-labelledby="rule-tab-request" className="flex flex-col gap-3 p-4">
          <HeaderOpEditor legend="Modify request headers" rows={draft.requestOps} onChange={(requestOps) => patch({ requestOps })} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-rewrite-request-body">Rewrite request body</Label>
            <Textarea
              id="rule-rewrite-request-body"
              aria-label="Rewrite request body"
              value={draft.requestBody}
              onChange={(event) => patch({ requestBody: event.target.value })}
              placeholder='{"q": 2}'
            />
          </div>
        </div>
      ) : (
        <div role="tabpanel" id="rule-panel-response" aria-labelledby="rule-tab-response" className="flex flex-col gap-3 p-4">
          <HeaderOpEditor legend="Modify response headers" rows={draft.responseOps} onChange={(responseOps) => patch({ responseOps })} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-rewrite-body">Rewrite response body</Label>
            <Textarea
              id="rule-rewrite-body"
              aria-label="Rewrite response body"
              value={draft.rewriteBody}
              onChange={(event) => patch({ rewriteBody: event.target.value })}
              placeholder='{"rewritten": true}'
            />
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="px-4 pb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
};

const HeaderOpEditor = ({ legend, rows, onChange }: { legend: string; rows: OpRow[]; onChange(rows: OpRow[]): void }) => {
  const update = (index: number, patch: Partial<OpRow>) =>
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  return (
    <div className="flex flex-col gap-2">
      <Label>{legend}</Label>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Select className="w-28" aria-label={`${legend} op ${index}`} value={row.op} onChange={(event) => update(index, { op: event.target.value as OpRow['op'] })}>
            <option value="set">set</option>
            <option value="remove">remove</option>
          </Select>
          <Input className="w-40" aria-label={`${legend} name ${index}`} placeholder="Header name" value={row.name} onChange={(event) => update(index, { name: event.target.value })} />
          {row.op === 'set' ? (
            <Input className="w-40" aria-label={`${legend} value ${index}`} placeholder="Value" value={row.value} onChange={(event) => update(index, { value: event.target.value })} />
          ) : null}
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${legend} ${index}`} onClick={() => onChange(rows.filter((_, position) => position !== index))}>
            <X />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { op: 'set', name: '', value: '' }])}>
          <Plus />
          Add {legend.toLowerCase()}
        </Button>
      </div>
    </div>
  );
};
