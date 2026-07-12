import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Rule } from '../../rules/model';
import type { UiGateway } from './gateway';
import { RulesProvider } from './RulesProvider';
import { RuleForm } from './RuleForm';
import { createFakeGateway } from './test-gateway';

const renderForm = (gateway: UiGateway, onDone = vi.fn(), initial?: Rule) =>
  render(
    <RulesProvider gateway={gateway}>
      <RuleForm initial={initial} onDone={onDone} />
    </RulesProvider>,
  );

const getNameInput = () => screen.getByLabelText(/name/i);
const getUrlPatternInput = () => screen.getByLabelText(/url pattern/i);
const getKindSelect = () => screen.getByRole('combobox', { name: /pattern kind/i });
const getBody = () => screen.getByLabelText(/rewrite response body/i);
const getSaveButton = () => screen.getByRole('button', { name: /save/i });
const gotoResponse = () => fireEvent.click(screen.getByRole('tab', { name: /response/i }));
const selectOption = (combobox: HTMLElement, optionName: RegExp) => {
  fireEvent.click(combobox);
  fireEvent.click(screen.getByRole('option', { name: optionName }));
};

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'existing rule',
  enabled: true,
  matchers: { url: { pattern: 'https://example.com/*', kind: 'glob' } },
  actions: [],
  ...overrides,
});

describe('RuleForm', () => {
  it('should render Match and Response actions as tabs, Match first (AC-007)', async () => {
    renderForm(createFakeGateway());
    await screen.findByRole('button', { name: /save/i });

    const matchTab = screen.getByRole('tab', { name: /^match$/i });
    const responseTab = screen.getByRole('tab', { name: /response/i });
    expect(matchTab).toHaveAttribute('aria-selected', 'true');
    expect(responseTab).toHaveAttribute('aria-selected', 'false');

    expect(getNameInput()).toBeInTheDocument();
    expect(getUrlPatternInput()).toBeInTheDocument();
    expect(getKindSelect()).toBeInTheDocument();
    expect(getSaveButton()).toBeInTheDocument();
    expect(screen.queryByLabelText(/rewrite response body/i)).not.toBeInTheDocument();
  });

  it('should reveal the Response actions panel and hide Match when the Response tab is selected (AC-007)', async () => {
    renderForm(createFakeGateway());
    await screen.findByRole('button', { name: /save/i });

    gotoResponse();

    expect(screen.getByRole('tab', { name: /response/i })).toHaveAttribute('aria-selected', 'true');
    expect(getBody()).toBeInTheDocument();
    expect(screen.queryByLabelText(/url pattern/i)).not.toBeInTheDocument();
  });

  it('should render the body-rewrite control enabled with no Firefox-only note (AC-007)', async () => {
    renderForm(createFakeGateway());
    await screen.findByRole('button', { name: /save/i });
    gotoResponse();

    expect(getBody()).not.toBeDisabled();
    expect(screen.queryByText(/firefox-only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/platform limitations/i)).not.toBeInTheDocument();
  });

  it('should NOT render removed request-action, mock, status or resource-type controls (AC-007)', async () => {
    renderForm(createFakeGateway());
    await screen.findByRole('button', { name: /save/i });

    expect(screen.queryByLabelText(/block the request/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/redirect url/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/return a mock response/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/override status code/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('xmlhttprequest')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add header matcher/i })).not.toBeInTheDocument();
  });

  it('should call gateway.addRule with the typed name and url pattern then call onDone on valid submit (AC-007)', async () => {
    const gateway = createFakeGateway();
    const onDone = vi.fn();
    renderForm(gateway, onDone);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getNameInput(), { target: { value: 'my new rule' } });
    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.addRule).toHaveBeenCalledTimes(1));
    const [created] = gateway.addRule.mock.calls[0] as [Rule];
    expect(created.name).toBe('my new rule');
    expect(created.matchers.url.pattern).toBe('https://api.test.dev/*');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('should show an inline validation error and NOT call gateway.addRule when url pattern is empty', async () => {
    const gateway = createFakeGateway();
    const onDone = vi.fn();
    renderForm(gateway, onDone);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getNameInput(), { target: { value: 'rule without url' } });
    fireEvent.click(getSaveButton());

    expect(await screen.findByText(/required|invalid|pattern/i)).toBeInTheDocument();
    expect(gateway.addRule).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('should prefill fields from the initial rule in edit mode', async () => {
    const initial = buildRule({
      name: 'prefilled rule',
      matchers: { url: { pattern: 'https://prefill.test/*', kind: 'regex' } },
    });
    renderForm(createFakeGateway(), vi.fn(), initial);
    await screen.findByRole('button', { name: /save/i });

    expect(getNameInput()).toHaveValue('prefilled rule');
    expect(getUrlPatternInput()).toHaveValue('https://prefill.test/*');
    expect(getKindSelect()).toHaveTextContent(/regex/i);
  });

  it('should prefill the response header ops and body from the initial rule in edit mode', async () => {
    const initial = buildRule({
      actions: [
        { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X-Env', value: 'staging' }] },
        { type: 'rewriteBody', body: '{"pre":true}' },
      ],
    });
    renderForm(createFakeGateway(), vi.fn(), initial);
    await screen.findByRole('button', { name: /save/i });
    gotoResponse();

    expect(getBody()).toHaveValue('{"pre":true}');
    expect(screen.getByLabelText(/Modify response headers name 0/i)).toHaveValue('X-Env');
  });

  it('should call updateRule (not addRule) preserving the id when editing', async () => {
    const gateway = createFakeGateway();
    const onDone = vi.fn();
    renderForm(gateway, onDone, buildRule({ id: 'edit-me', name: 'old name' }));
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getNameInput(), { target: { value: 'new name' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.updateRule).toHaveBeenCalledTimes(1));
    const [updated] = gateway.updateRule.mock.calls[0] as [Rule];
    expect(updated.id).toBe('edit-me');
    expect(updated.name).toBe('new name');
    expect(gateway.addRule).not.toHaveBeenCalled();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('should include selected methods in the saved rule', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'GET' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'POST' }));
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.addRule).toHaveBeenCalledTimes(1));
    const [created] = gateway.addRule.mock.calls[0] as [Rule];
    expect(created.matchers.methods).toContain('GET');
    expect(created.matchers.methods).toContain('POST');
  });

  it('should save the pattern kind when regex is selected', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/.*' } });
    selectOption(getKindSelect(), /regex/i);
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.addRule).toHaveBeenCalledTimes(1));
    const [created] = gateway.addRule.mock.calls[0] as [Rule];
    expect(created.matchers.url.kind).toBe('regex');
  });

  it('should include a rewriteBody action when the body field is filled (AC-002)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    gotoResponse();
    fireEvent.change(getBody(), { target: { value: '<p>x</p>' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.addRule).toHaveBeenCalledTimes(1));
    const [created] = gateway.addRule.mock.calls[0] as [Rule];
    expect(created.actions).toContainEqual({ type: 'rewriteBody', body: '<p>x</p>' });
  });

  it('should NOT include a rewriteBody action when the body field is left empty', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.addRule).toHaveBeenCalledTimes(1));
    const [created] = gateway.addRule.mock.calls[0] as [Rule];
    expect(created.actions.some((action) => action.type === 'rewriteBody')).toBe(false);
  });

  it('should include a modifyResponseHeaders action with a remove op (AC-003)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    gotoResponse();
    fireEvent.click(screen.getByRole('button', { name: /add modify response headers/i }));
    selectOption(screen.getByRole('combobox', { name: /Modify response headers op 0/i }), /remove/i);
    fireEvent.change(screen.getByLabelText(/Modify response headers name 0/i), { target: { value: 'Set-Cookie' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.addRule).toHaveBeenCalledTimes(1));
    const [rule] = gateway.addRule.mock.calls[0] as [Rule];
    expect(rule.actions).toContainEqual({
      type: 'modifyResponseHeaders',
      headers: [{ op: 'remove', name: 'Set-Cookie' }],
    });
  });

  it('should include both a header op and a body rewrite when both are filled (AC-004)', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    gotoResponse();
    fireEvent.change(getBody(), { target: { value: 'new-body' } });
    fireEvent.click(screen.getByRole('button', { name: /add modify response headers/i }));
    fireEvent.change(screen.getByLabelText(/Modify response headers name 0/i), { target: { value: 'X-Test' } });
    fireEvent.change(screen.getByLabelText(/Modify response headers value 0/i), { target: { value: 'on' } });
    fireEvent.click(getSaveButton());

    await waitFor(() => expect(gateway.addRule).toHaveBeenCalledTimes(1));
    const [rule] = gateway.addRule.mock.calls[0] as [Rule];
    expect(rule.actions).toContainEqual({ type: 'rewriteBody', body: 'new-body' });
    expect(rule.actions).toContainEqual({
      type: 'modifyResponseHeaders',
      headers: [{ op: 'set', name: 'X-Test', value: 'on' }],
    });
  });

  it('should block save and show an error for an invalid regex pattern', async () => {
    const gateway = createFakeGateway();
    renderForm(gateway);
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: '[' } });
    selectOption(getKindSelect(), /regex/i);
    fireEvent.click(getSaveButton());

    expect(await screen.findByText(/invalid regular expression/i)).toBeInTheDocument();
    expect(gateway.addRule).not.toHaveBeenCalled();
  });

  it('should report a positive match in the URL tester', async () => {
    renderForm(createFakeGateway());
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.change(screen.getByLabelText(/test url/i), { target: { value: 'https://api.test.dev/users' } });

    expect(await screen.findByText(/matches/i)).toBeInTheDocument();
  });

  it('should report a non-match in the URL tester', async () => {
    renderForm(createFakeGateway());
    await screen.findByRole('button', { name: /save/i });

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });
    fireEvent.change(screen.getByLabelText(/test url/i), { target: { value: 'https://other.dev/x' } });

    expect(await screen.findByText(/does not match/i)).toBeInTheDocument();
  });
});
