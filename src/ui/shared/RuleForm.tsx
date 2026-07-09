import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type {
  HeaderMatcher,
  HeaderOp,
  HttpMethod,
  PatternKind,
  ResourceType,
  Rule,
  RuleAction,
} from '../../rules/model';
import { matchUrl } from '../../rules/match';
import { Accordion } from '../components/ui/accordion';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { useRules } from './RulesProvider';

export type RuleFormProps = {
  initial?: Rule;
  onDone(): void;
};

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const RESOURCE_TYPES: ResourceType[] = ['xmlhttprequest', 'script', 'image', 'stylesheet', 'font', 'media', 'sub_frame', 'main_frame', 'other'];

const isValidRegex = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

export type CapabilityInput = {
  responseBodyRewrite: boolean;
  artificialLatency: boolean;
  rewriteBody: string;
  mockEnabled: boolean;
  mockStatus: string;
  mockLatency: string;
  mockHeaderCount: number;
};

export const capabilityWarnings = (input: CapabilityInput): string[] => {
  const warnings: string[] = [];
  if (!input.responseBodyRewrite && input.rewriteBody.trim() !== '') {
    warnings.push('Response-body rewrite is Firefox-only; it will be ignored on Chrome.');
  }
  if (input.mockEnabled && !input.artificialLatency) {
    if (input.mockStatus.trim() !== '' && Number(input.mockStatus) !== 200) {
      warnings.push('Chrome mocks always return HTTP 200; the custom status code will not be enforced.');
    }
    if (input.mockHeaderCount > 0) {
      warnings.push('Chrome mocks carry no custom response headers; mock headers will not be enforced.');
    }
    if (Number(input.mockLatency) > 0) {
      warnings.push('Artificial latency is Firefox-only; it will be ignored on Chrome.');
    }
  }
  return warnings;
};

type MatcherRow = { name: string; mode: 'present' | 'equals' | 'contains'; value: string };
type OpRow = { op: 'set' | 'remove'; name: string; value: string };

const makeId = (seed: string): string => `rule-${seed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${seed.length}`;

const findAction = <T extends RuleAction['type']>(rule: Rule | undefined, type: T): Extract<RuleAction, { type: T }> | undefined =>
  rule?.actions.find((action): action is Extract<RuleAction, { type: T }> => action.type === type);

const matcherToRow = (matcher: HeaderMatcher): MatcherRow => {
  if (matcher.equals !== undefined) return { name: matcher.name, mode: 'equals', value: matcher.equals };
  if (matcher.contains !== undefined) return { name: matcher.name, mode: 'contains', value: matcher.contains };
  return { name: matcher.name, mode: 'present', value: '' };
};

const rowToMatcher = (row: MatcherRow): HeaderMatcher => {
  if (row.mode === 'equals') return { name: row.name, equals: row.value };
  if (row.mode === 'contains') return { name: row.name, contains: row.value };
  return { name: row.name };
};

const opToRow = (op: HeaderOp): OpRow =>
  op.op === 'set' ? { op: 'set', name: op.name, value: op.value } : { op: 'remove', name: op.name, value: '' };

const rowToOp = (row: OpRow): HeaderOp =>
  row.op === 'set' ? { op: 'set', name: row.name, value: row.value } : { op: 'remove', name: row.name };

const Field = ({ htmlFor, label, children }: { htmlFor: string; label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
  </div>
);

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

export const RuleForm = ({ initial, onDone }: RuleFormProps) => {
  const { addRule, updateRule, capabilities } = useRules();
  const [name, setName] = useState(initial?.name ?? '');
  const [pattern, setPattern] = useState(initial?.matchers.url.pattern ?? '');
  const [kind, setKind] = useState<PatternKind>(initial?.matchers.url.kind ?? 'glob');
  const [testUrl, setTestUrl] = useState('');
  const [methods, setMethods] = useState<HttpMethod[]>(initial?.matchers.methods ?? []);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>(initial?.matchers.resourceTypes ?? []);
  const [headerMatchers, setHeaderMatchers] = useState<MatcherRow[]>(
    (initial?.matchers.requestHeaders ?? []).map(matcherToRow),
  );

  const [requestOps, setRequestOps] = useState<OpRow[]>(
    (findAction(initial, 'modifyRequestHeaders')?.headers ?? []).map(opToRow),
  );
  const [redirectUrl, setRedirectUrl] = useState(findAction(initial, 'redirect')?.url ?? '');
  const [block, setBlock] = useState(findAction(initial, 'block') !== undefined);
  const [responseOps, setResponseOps] = useState<OpRow[]>(
    (findAction(initial, 'modifyResponseHeaders')?.headers ?? []).map(opToRow),
  );
  const [status, setStatus] = useState(findAction(initial, 'setStatus')?.status.toString() ?? '');
  const [rewriteBody, setRewriteBody] = useState(findAction(initial, 'rewriteBody')?.body ?? '');

  const initialMock = findAction(initial, 'mock');
  const [mockEnabled, setMockEnabled] = useState(initialMock !== undefined);
  const [mockStatus, setMockStatus] = useState((initialMock?.status ?? 200).toString());
  const [mockBody, setMockBody] = useState(initialMock?.body ?? '');
  const [mockContentType, setMockContentType] = useState(initialMock?.contentType ?? 'application/json');
  const [mockLatency, setMockLatency] = useState((initialMock?.latencyMs ?? 0).toString());
  const [mockHeaders, setMockHeaders] = useState<OpRow[]>((initialMock?.headers ?? []).map(opToRow));

  const [error, setError] = useState<string | undefined>(undefined);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const buildActions = (): RuleAction[] => {
    const actions: RuleAction[] = [];
    if (block) actions.push({ type: 'block' });
    if (redirectUrl.trim() !== '') actions.push({ type: 'redirect', url: redirectUrl });
    const reqOps = requestOps.filter((row) => row.name.trim() !== '').map(rowToOp);
    if (reqOps.length > 0) actions.push({ type: 'modifyRequestHeaders', headers: reqOps });
    const respOps = responseOps.filter((row) => row.name.trim() !== '').map(rowToOp);
    if (respOps.length > 0) actions.push({ type: 'modifyResponseHeaders', headers: respOps });
    if (status.trim() !== '') actions.push({ type: 'setStatus', status: Number(status) });
    if (capabilities.responseBodyRewrite && rewriteBody.trim() !== '') {
      actions.push({ type: 'rewriteBody', body: rewriteBody });
    }
    if (mockEnabled) {
      actions.push({
        type: 'mock',
        status: Number(mockStatus) || 200,
        headers: mockHeaders.filter((row) => row.name.trim() !== '').map(rowToOp),
        body: mockBody,
        contentType: mockContentType,
        ...(Number(mockLatency) > 0 ? { latencyMs: Number(mockLatency) } : {}),
      });
    }
    return actions;
  };

  const onSubmit = async () => {
    if (pattern.trim() === '') {
      setError('URL pattern is required.');
      return;
    }
    if (kind === 'regex' && !isValidRegex(pattern)) {
      setError('Invalid regular expression.');
      return;
    }
    setError(undefined);

    const matchers: Rule['matchers'] = {
      url: { pattern, kind },
      ...(methods.length > 0 ? { methods } : {}),
      ...(resourceTypes.length > 0 ? { resourceTypes } : {}),
      ...(headerMatchers.length > 0 ? { requestHeaders: headerMatchers.filter((row) => row.name.trim() !== '').map(rowToMatcher) } : {}),
    };

    const rule: Rule = {
      id: initial?.id ?? makeId(name || pattern),
      name: name || pattern,
      enabled: initial?.enabled ?? true,
      priority: initial?.priority ?? 0,
      matchers,
      actions: buildActions(),
    };

    await (initial ? updateRule(rule) : addRule(rule));
    onDone();
  };

  const warnings = capabilityWarnings({
    responseBodyRewrite: capabilities.responseBodyRewrite,
    artificialLatency: capabilities.artificialLatency,
    rewriteBody,
    mockEnabled,
    mockStatus,
    mockLatency,
    mockHeaderCount: mockHeaders.filter((row) => row.name.trim() !== '').length,
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <Accordion title="Match" defaultOpen>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field htmlFor="rule-name" label="Name">
            <Input id="rule-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="My rule" />
          </Field>
          <Field htmlFor="rule-url" label="URL">
            <Input id="rule-url" aria-label="URL pattern" value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="https://example.com/*" />
          </Field>
          <Field htmlFor="rule-kind" label="Match kind">
            <Select id="rule-kind" aria-label="Pattern kind" value={kind} onChange={(event) => setKind(event.target.value as PatternKind)}>
              <option value="glob">glob</option>
              <option value="regex">regex</option>
            </Select>
          </Field>
        </div>

        <Field htmlFor="rule-test-url" label="Try a URL against this rule">
          <Input
            id="rule-test-url"
            aria-label="Test URL"
            value={testUrl}
            onChange={(event) => setTestUrl(event.target.value)}
            placeholder="https://example.com/path"
          />
          {testUrl.trim() !== '' ? <MatchHint pattern={pattern} kind={kind} url={testUrl} /> : null}
        </Field>

        <div className="flex flex-col gap-1.5">
          <Label>Methods</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {METHODS.map((method) => (
              <label key={method} className="inline-flex items-center gap-1.5 text-sm">
                <Checkbox checked={methods.includes(method)} onChange={() => setMethods(toggle(methods, method))} />
                {method}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Resource types</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {RESOURCE_TYPES.map((resourceType) => (
              <label key={resourceType} className="inline-flex items-center gap-1.5 text-sm">
                <Checkbox
                  aria-label={resourceType}
                  checked={resourceTypes.includes(resourceType)}
                  onChange={() => setResourceTypes(toggle(resourceTypes, resourceType))}
                />
                {resourceType}
              </label>
            ))}
          </div>
        </div>

        <HeaderMatcherEditor rows={headerMatchers} onChange={setHeaderMatchers} />
      </Accordion>

      <Accordion title="Request actions">
        <label className="inline-flex items-center gap-2 text-sm">
          <Checkbox checked={block} onChange={() => setBlock(!block)} />
          Block the request
        </label>
        <Field htmlFor="rule-redirect" label="Redirect URL">
          <Input id="rule-redirect" value={redirectUrl} onChange={(event) => setRedirectUrl(event.target.value)} placeholder="https://elsewhere.test/" />
        </Field>
        <HeaderOpEditor legend="Modify request headers" rows={requestOps} onChange={setRequestOps} />
      </Accordion>

      <Accordion title="Response actions">
        <HeaderOpEditor legend="Modify response headers" rows={responseOps} onChange={setResponseOps} />
        <Field htmlFor="rule-status" label="Override status code">
          <Input id="rule-status" type="number" value={status} onChange={(event) => setStatus(event.target.value)} placeholder="200" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-rewrite-body">Rewrite response body</Label>
          <Textarea
            id="rule-rewrite-body"
            data-testid="body-rewrite-toggle"
            aria-label="Rewrite response body"
            disabled={!capabilities.responseBodyRewrite}
            aria-disabled={!capabilities.responseBodyRewrite}
            value={rewriteBody}
            onChange={(event) => setRewriteBody(event.target.value)}
            placeholder='{"rewritten": true}'
          />
          {!capabilities.responseBodyRewrite ? (
            <small className="text-xs text-muted-foreground" title="Chrome cannot rewrite response bodies; this is Firefox-only.">
              Disabled - response-body rewrite is Firefox-only.
            </small>
          ) : null}
        </div>
      </Accordion>

      <Accordion title="Mock response">
        <label className="inline-flex items-center gap-2 text-sm">
          <Checkbox checked={mockEnabled} onChange={() => setMockEnabled(!mockEnabled)} />
          Return a mock response without forwarding
        </label>
        {mockEnabled ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field htmlFor="mock-status" label="Mock status">
                <Input id="mock-status" type="number" value={mockStatus} onChange={(event) => setMockStatus(event.target.value)} />
              </Field>
              <Field htmlFor="mock-ctype" label="Mock content type">
                <Input id="mock-ctype" value={mockContentType} onChange={(event) => setMockContentType(event.target.value)} />
              </Field>
              <Field htmlFor="mock-latency" label="Mock latency (ms)">
                <Input id="mock-latency" type="number" value={mockLatency} onChange={(event) => setMockLatency(event.target.value)} />
              </Field>
            </div>
            <Field htmlFor="mock-body" label="Mock body">
              <Textarea id="mock-body" value={mockBody} onChange={(event) => setMockBody(event.target.value)} placeholder='{"ok": true}' />
            </Field>
            <HeaderOpEditor legend="Mock response headers" rows={mockHeaders} onChange={setMockHeaders} />
          </div>
        ) : null}
      </Accordion>

      {warnings.length > 0 ? (
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <p className="mb-1 font-semibold">Platform limitations on this browser:</p>
          <ul className="list-disc pl-4">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

const HeaderMatcherEditor = ({ rows, onChange }: { rows: MatcherRow[]; onChange(rows: MatcherRow[]): void }) => {
  const update = (index: number, patch: Partial<MatcherRow>) =>
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  return (
    <div className="flex flex-col gap-2">
      <Label>Request header matchers</Label>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input className="w-40" aria-label={`Header matcher name ${index}`} placeholder="Header name" value={row.name} onChange={(event) => update(index, { name: event.target.value })} />
          <Select className="w-28" aria-label={`Header matcher mode ${index}`} value={row.mode} onChange={(event) => update(index, { mode: event.target.value as MatcherRow['mode'] })}>
            <option value="present">present</option>
            <option value="equals">equals</option>
            <option value="contains">contains</option>
          </Select>
          {row.mode !== 'present' ? (
            <Input className="w-40" aria-label={`Header matcher value ${index}`} placeholder="Value" value={row.value} onChange={(event) => update(index, { value: event.target.value })} />
          ) : null}
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove header matcher ${index}`} onClick={() => onChange(rows.filter((_, position) => position !== index))}>
            <X />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { name: '', mode: 'present', value: '' }])}>
          <Plus />
          Add header matcher
        </Button>
      </div>
    </div>
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
