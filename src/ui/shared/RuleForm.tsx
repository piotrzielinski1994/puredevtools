import { useState } from 'react';
import type {
  HeaderMatcher,
  HeaderOp,
  HttpMethod,
  PatternKind,
  ResourceType,
  Rule,
  RuleAction,
} from '../../rules/model';
import { useRules } from './RulesProvider';

export type RuleFormProps = {
  initial?: Rule;
  onDone(): void;
};

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const RESOURCE_TYPES: ResourceType[] = ['xmlhttprequest', 'script', 'image', 'stylesheet', 'font', 'media', 'sub_frame', 'main_frame', 'other'];

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

export const RuleForm = ({ initial, onDone }: RuleFormProps) => {
  const { addRule, updateRule, capabilities } = useRules();
  const [name, setName] = useState(initial?.name ?? '');
  const [pattern, setPattern] = useState(initial?.matchers.url.pattern ?? '');
  const [kind, setKind] = useState<PatternKind>(initial?.matchers.url.kind ?? 'glob');
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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <div>
        <label htmlFor="rule-name">Name</label>
        <input id="rule-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div>
        <label htmlFor="rule-url">URL</label>
        <input id="rule-url" aria-label="URL pattern" value={pattern} onChange={(event) => setPattern(event.target.value)} />
      </div>
      <div>
        <label htmlFor="rule-kind">Match kind</label>
        <select id="rule-kind" aria-label="Pattern kind" value={kind} onChange={(event) => setKind(event.target.value as PatternKind)}>
          <option value="glob">glob</option>
          <option value="regex">regex</option>
        </select>
      </div>

      <fieldset>
        <legend>Methods</legend>
        {METHODS.map((method) => (
          <label key={method}>
            <input type="checkbox" checked={methods.includes(method)} onChange={() => setMethods(toggle(methods, method))} />
            {method}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Resource types</legend>
        {RESOURCE_TYPES.map((resourceType) => (
          <label key={resourceType}>
            <input
              type="checkbox"
              checked={resourceTypes.includes(resourceType)}
              onChange={() => setResourceTypes(toggle(resourceTypes, resourceType))}
            />
            {resourceType}
          </label>
        ))}
      </fieldset>

      <HeaderMatcherEditor rows={headerMatchers} onChange={setHeaderMatchers} />

      <fieldset>
        <legend>Request actions</legend>
        <label>
          <input type="checkbox" checked={block} onChange={() => setBlock(!block)} />
          Block the request
        </label>
        <div>
          <label htmlFor="rule-redirect">Redirect URL</label>
          <input id="rule-redirect" value={redirectUrl} onChange={(event) => setRedirectUrl(event.target.value)} />
        </div>
        <HeaderOpEditor legend="Modify request headers" rows={requestOps} onChange={setRequestOps} />
      </fieldset>

      <fieldset>
        <legend>Response actions</legend>
        <HeaderOpEditor legend="Modify response headers" rows={responseOps} onChange={setResponseOps} />
        <div>
          <label htmlFor="rule-status">Override status code</label>
          <input id="rule-status" type="number" value={status} onChange={(event) => setStatus(event.target.value)} />
        </div>
        <div>
          <label htmlFor="rule-rewrite-body">Rewrite response body</label>
          <textarea
            id="rule-rewrite-body"
            data-testid="body-rewrite-toggle"
            aria-label="Rewrite response body"
            disabled={!capabilities.responseBodyRewrite}
            aria-disabled={!capabilities.responseBodyRewrite}
            value={rewriteBody}
            onChange={(event) => setRewriteBody(event.target.value)}
          />
          {!capabilities.responseBodyRewrite ? (
            <small title="Chrome cannot rewrite response bodies; this is Firefox-only.">
              Disabled - response-body rewrite is Firefox-only.
            </small>
          ) : null}
        </div>
      </fieldset>

      <fieldset>
        <legend>Mock response</legend>
        <label>
          <input type="checkbox" checked={mockEnabled} onChange={() => setMockEnabled(!mockEnabled)} />
          Return a mock response without forwarding
        </label>
        {mockEnabled ? (
          <div>
            <label htmlFor="mock-status">Mock status</label>
            <input id="mock-status" type="number" value={mockStatus} onChange={(event) => setMockStatus(event.target.value)} />
            <label htmlFor="mock-ctype">Mock content type</label>
            <input id="mock-ctype" value={mockContentType} onChange={(event) => setMockContentType(event.target.value)} />
            <label htmlFor="mock-body">Mock body</label>
            <textarea id="mock-body" value={mockBody} onChange={(event) => setMockBody(event.target.value)} />
            <label htmlFor="mock-latency">Mock latency (ms)</label>
            <input id="mock-latency" type="number" value={mockLatency} onChange={(event) => setMockLatency(event.target.value)} />
            <HeaderOpEditor legend="Mock response headers" rows={mockHeaders} onChange={setMockHeaders} />
          </div>
        ) : null}
      </fieldset>

      {error ? <p role="alert" style={{ color: '#c00' }}>{error}</p> : null}
      <button type="submit">Save</button>
      <button type="button" onClick={onDone}>
        Cancel
      </button>
    </form>
  );
};

const HeaderMatcherEditor = ({ rows, onChange }: { rows: MatcherRow[]; onChange(rows: MatcherRow[]): void }) => {
  const update = (index: number, patch: Partial<MatcherRow>) =>
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  return (
    <fieldset>
      <legend>Request header matchers</legend>
      {rows.map((row, index) => (
        <div key={index}>
          <input aria-label={`Header matcher name ${index}`} value={row.name} onChange={(event) => update(index, { name: event.target.value })} />
          <select aria-label={`Header matcher mode ${index}`} value={row.mode} onChange={(event) => update(index, { mode: event.target.value as MatcherRow['mode'] })}>
            <option value="present">present</option>
            <option value="equals">equals</option>
            <option value="contains">contains</option>
          </select>
          {row.mode !== 'present' ? (
            <input aria-label={`Header matcher value ${index}`} value={row.value} onChange={(event) => update(index, { value: event.target.value })} />
          ) : null}
          <button type="button" aria-label={`Remove header matcher ${index}`} onClick={() => onChange(rows.filter((_, position) => position !== index))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { name: '', mode: 'present', value: '' }])}>
        Add header matcher
      </button>
    </fieldset>
  );
};

const HeaderOpEditor = ({ legend, rows, onChange }: { legend: string; rows: OpRow[]; onChange(rows: OpRow[]): void }) => {
  const update = (index: number, patch: Partial<OpRow>) =>
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  return (
    <fieldset>
      <legend>{legend}</legend>
      {rows.map((row, index) => (
        <div key={index}>
          <select aria-label={`${legend} op ${index}`} value={row.op} onChange={(event) => update(index, { op: event.target.value as OpRow['op'] })}>
            <option value="set">set</option>
            <option value="remove">remove</option>
          </select>
          <input aria-label={`${legend} name ${index}`} value={row.name} onChange={(event) => update(index, { name: event.target.value })} />
          {row.op === 'set' ? (
            <input aria-label={`${legend} value ${index}`} value={row.value} onChange={(event) => update(index, { value: event.target.value })} />
          ) : null}
          <button type="button" aria-label={`Remove ${legend} ${index}`} onClick={() => onChange(rows.filter((_, position) => position !== index))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, { op: 'set', name: '', value: '' }])}>
        Add {legend.toLowerCase()}
      </button>
    </fieldset>
  );
};
