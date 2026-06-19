import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Capabilities } from '../../engine/RequestEngine';
import type { Rule } from '../../rules/model';
import type { ImportOutcome, UiGateway } from './gateway';
import { RulesProvider } from './RulesProvider';
import { RuleForm } from './RuleForm';

type FakeGateway = UiGateway & {
  getAll: ReturnType<typeof vi.fn>;
  getGlobalEnabled: ReturnType<typeof vi.fn>;
  getCapabilities: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reorder: ReturnType<typeof vi.fn>;
  setGlobalEnabled: ReturnType<typeof vi.fn>;
  exportToFile: ReturnType<typeof vi.fn>;
  importFromFile: ReturnType<typeof vi.fn>;
};

const createFakeGateway = (
  capabilities: Capabilities = { responseBodyRewrite: true, artificialLatency: true },
): FakeGateway => ({
  getAll: vi.fn<() => Promise<Rule[]>>().mockResolvedValue([]),
  getGlobalEnabled: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  getCapabilities: vi.fn<() => Promise<Capabilities>>().mockResolvedValue(capabilities),
  add: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  update: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  remove: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  reorder: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  setGlobalEnabled: vi.fn<(enabled: boolean) => Promise<void>>().mockResolvedValue(undefined),
  exportToFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  importFromFile: vi.fn<(json: string) => Promise<ImportOutcome>>().mockResolvedValue({ ok: true }),
});

const renderForm = (gateway: UiGateway, onDone = vi.fn(), initial?: Rule) =>
  render(
    <RulesProvider gateway={gateway}>
      <RuleForm initial={initial} onDone={onDone} />
    </RulesProvider>,
  );

const getNameInput = () => screen.getByLabelText(/name/i);
const getUrlPatternInput = () => screen.getByLabelText(/url pattern/i);
const getKindSelect = () => screen.getByLabelText(/pattern kind/i);
const getSaveButton = () => screen.getByRole('button', { name: /save/i });

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'existing rule',
  enabled: true,
  priority: 0,
  matchers: { url: { pattern: 'https://example.com/*', kind: 'glob' } },
  actions: [],
  ...overrides,
});

describe('RuleForm', () => {
  it('should render the essential create-form fields (AC-003)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    expect(getNameInput()).toBeInTheDocument();
    expect(getUrlPatternInput()).toBeInTheDocument();
    expect(screen.getByLabelText(/pattern kind|kind/i)).toBeInTheDocument();
    expect(screen.getByTestId('body-rewrite-toggle')).toBeInTheDocument();
    expect(getSaveButton()).toBeInTheDocument();
  });

  it('should call gateway.add with the typed name and url pattern then call onDone on valid submit (AC-004)', async () => {
    const gateway = createFakeGateway();
    const onDone = vi.fn();
    renderForm(gateway, onDone);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getNameInput(), { target: { value: 'my new rule' } });
    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [created] = gateway.add.mock.calls[0] as [Rule];
    expect(created.name).toBe('my new rule');
    expect(created.matchers.url.pattern).toBe('https://api.test.dev/*');

    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('should show an inline validation error and NOT call gateway.add when url pattern is empty (AC-004)', async () => {
    const gateway = createFakeGateway();
    const onDone = vi.fn();
    renderForm(gateway, onDone);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getNameInput(), { target: { value: 'rule without url' } });
    fireEvent.click(getSaveButton());

    expect(await screen.findByText(/required|invalid|cannot be empty|pattern/i)).toBeInTheDocument();
    expect(gateway.add).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('should disable the body-rewrite control when responseBodyRewrite capability is false (AC-009)', async () => {
    const gateway = createFakeGateway({ responseBodyRewrite: false, artificialLatency: true });
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    const control = screen.getByTestId('body-rewrite-toggle');
    const isDisabled = control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true';
    expect(isDisabled).toBe(true);
  });

  it('should enable the body-rewrite control when responseBodyRewrite capability is true (AC-009)', async () => {
    const gateway = createFakeGateway({ responseBodyRewrite: true, artificialLatency: true });
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    const control = screen.getByTestId('body-rewrite-toggle');
    const isDisabled = control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true';
    expect(isDisabled).toBe(false);
  });

  it('should prefill fields from the initial rule in edit mode (AC-005)', async () => {
    const gateway = createFakeGateway();
    const initial = buildRule({
      name: 'prefilled rule',
      matchers: { url: { pattern: 'https://prefill.test/*', kind: 'regex' } },
    });
    renderForm(gateway, vi.fn(), initial);

    await screen.findByRole('button', { name: /save/i });

    expect(getNameInput()).toHaveValue('prefilled rule');
    expect(getUrlPatternInput()).toHaveValue('https://prefill.test/*');
    expect(getKindSelect()).toHaveValue('regex');
  });

  it('should call updateRule (not addRule) preserving the id when editing (AC-005)', async () => {
    const gateway = createFakeGateway();
    const onDone = vi.fn();
    const initial = buildRule({ id: 'edit-me', name: 'old name' });
    renderForm(gateway, onDone, initial);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getNameInput(), { target: { value: 'new name' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.update).toHaveBeenCalledTimes(1));
    const [updated] = gateway.update.mock.calls[0] as [Rule];
    expect(updated.id).toBe('edit-me');
    expect(updated.name).toBe('new name');
    expect(gateway.add).not.toHaveBeenCalled();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('should include selected methods in the saved rule (AC-004)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'GET' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'POST' }));
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [created] = gateway.add.mock.calls[0] as [Rule];
    expect(created.matchers.methods).toContain('GET');
    expect(created.matchers.methods).toContain('POST');
  });

  it('should save the pattern kind when regex is selected (AC-004)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/.*' } });
    fireEvent.change(getKindSelect(), { target: { value: 'regex' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [created] = gateway.add.mock.calls[0] as [Rule];
    expect(created.matchers.url.kind).toBe('regex');
  });

  it('should include a rewriteBody action when the body-rewrite control is enabled and filled (AC-009)', async () => {
    const gateway = createFakeGateway({ responseBodyRewrite: true, artificialLatency: true });
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.change(screen.getByTestId('body-rewrite-toggle'), { target: { value: '<p>x</p>' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [created] = gateway.add.mock.calls[0] as [Rule];
    expect(created.actions).toContainEqual({ type: 'rewriteBody', body: '<p>x</p>' });
  });

  it('should NOT include a rewriteBody action when the capability is disabled even if text is present (AC-009)', async () => {
    const gateway = createFakeGateway({ responseBodyRewrite: false, artificialLatency: true });
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(screen.getByTestId('body-rewrite-toggle'), { target: { value: '<p>x</p>' } });
    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [created] = gateway.add.mock.calls[0] as [Rule];
    const hasRewriteBody = created.actions.some((action) => action.type === 'rewriteBody');
    expect(hasRewriteBody).toBe(false);
  });

  it('should include a request header matcher in the saved rule', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByRole('button', { name: /add header matcher/i }));
    fireEvent.change(screen.getByLabelText(/Header matcher name 0/i), { target: { value: 'authorization' } });
    fireEvent.change(screen.getByLabelText(/Header matcher mode 0/i), { target: { value: 'contains' } });
    fireEvent.change(screen.getByLabelText(/Header matcher value 0/i), { target: { value: 'Bearer' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    expect(rule.matchers.requestHeaders).toContainEqual({ name: 'authorization', contains: 'Bearer' });
  });

  it('should include a present-mode header matcher with only a name', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByRole('button', { name: /add header matcher/i }));
    fireEvent.change(screen.getByLabelText(/Header matcher name 0/i), { target: { value: 'x-trace' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    expect(rule.matchers.requestHeaders).toContainEqual({ name: 'x-trace' });
  });

  it('should include a redirect action with the entered url', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.change(screen.getByLabelText(/redirect url/i), { target: { value: 'https://mock.test/x' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    expect(rule.actions).toContainEqual({ type: 'redirect', url: 'https://mock.test/x' });
  });

  it('should include a modifyRequestHeaders action with a set op', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByRole('button', { name: /add modify request headers/i }));
    fireEvent.change(screen.getByLabelText(/Modify request headers op 0/i), { target: { value: 'set' } });
    fireEvent.change(screen.getByLabelText(/Modify request headers name 0/i), { target: { value: 'X-Env' } });
    fireEvent.change(screen.getByLabelText(/Modify request headers value 0/i), { target: { value: 'staging' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    expect(rule.actions).toContainEqual({
      type: 'modifyRequestHeaders',
      headers: [{ op: 'set', name: 'X-Env', value: 'staging' }],
    });
  });

  it('should include a modifyResponseHeaders action with a remove op', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByRole('button', { name: /add modify response headers/i }));
    fireEvent.change(screen.getByLabelText(/Modify response headers op 0/i), { target: { value: 'remove' } });
    fireEvent.change(screen.getByLabelText(/Modify response headers name 0/i), { target: { value: 'Set-Cookie' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    expect(rule.actions).toContainEqual({
      type: 'modifyResponseHeaders',
      headers: [{ op: 'remove', name: 'Set-Cookie' }],
    });
  });

  it('should include a setStatus action when an override status is entered', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.change(screen.getByLabelText(/override status code/i), { target: { value: '503' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    expect(rule.actions).toContainEqual({ type: 'setStatus', status: 503 });
  });

  it('should include a mock action with status body and content type', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByLabelText(/return a mock response/i));
    fireEvent.change(screen.getByLabelText(/mock status/i), { target: { value: '201' } });
    fireEvent.change(screen.getByLabelText(/mock content type/i), { target: { value: 'application/json' } });
    fireEvent.change(screen.getByLabelText(/mock body/i), { target: { value: '{"ok":1}' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    const mockAction = rule.actions.find((action) => action.type === 'mock');
    expect(mockAction).toMatchObject({
      type: 'mock',
      status: 201,
      body: '{"ok":1}',
      contentType: 'application/json',
    });
  });

  it('should include latencyMs in the mock action when a positive latency is entered', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByLabelText(/return a mock response/i));
    fireEvent.change(screen.getByLabelText(/mock latency/i), { target: { value: '300' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    const mockAction = rule.actions.find((action) => action.type === 'mock');
    expect(mockAction?.type).toBe('mock');
    expect(mockAction?.type === 'mock' ? mockAction.latencyMs : undefined).toBe(300);
  });

  it('should not set latencyMs when latency is zero', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByLabelText(/return a mock response/i));
    fireEvent.change(screen.getByLabelText(/mock latency/i), { target: { value: '0' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    const mockAction = rule.actions.find((action) => action.type === 'mock');
    expect(mockAction?.type).toBe('mock');
    expect(mockAction?.type === 'mock' ? mockAction.latencyMs : 'unset').toBeUndefined();
  });

  it('should include a block action when the block checkbox is checked (AC-003)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByLabelText(/block the request/i));
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    expect(rule.actions).toContainEqual({ type: 'block' });
  });

  it('should include selected resource types in the saved rule (AC-003)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByLabelText('xmlhttprequest'));
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    expect(rule.matchers.resourceTypes).toContain('xmlhttprequest');
  });

  it('should include mock response headers in the mock action (AC-003)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByLabelText(/return a mock response/i));
    fireEvent.click(screen.getByRole('button', { name: /add mock response headers/i }));
    fireEvent.change(screen.getByLabelText(/Mock response headers name 0/i), { target: { value: 'X-Mock' } });
    fireEvent.change(screen.getByLabelText(/Mock response headers value 0/i), { target: { value: 'yes' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [rule] = gateway.add.mock.calls[0] as [Rule];
    const mockAction = rule.actions.find((action) => action.type === 'mock');
    expect(mockAction?.type === 'mock' ? mockAction.headers : []).toContainEqual({ op: 'set', name: 'X-Mock', value: 'yes' });
  });

  it('should block save and show an error for an invalid regex pattern', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: '[' } });
    fireEvent.change(getKindSelect(), { target: { value: 'regex' } });
    fireEvent.click(getSaveButton());

    expect(await screen.findByText(/invalid regular expression/i)).toBeInTheDocument();
    expect(gateway.add).not.toHaveBeenCalled();
  });

  it('should report a positive match in the URL tester', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.change(screen.getByLabelText(/test url/i), { target: { value: 'https://api.test.dev/users' } });

    expect(await screen.findByText(/matches/i)).toBeInTheDocument();
  });

  it('should report a non-match in the URL tester', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);

    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.change(screen.getByLabelText(/test url/i), { target: { value: 'https://other.dev/x' } });

    expect(await screen.findByText(/does not match/i)).toBeInTheDocument();
  });
});
