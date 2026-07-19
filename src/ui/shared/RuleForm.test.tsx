// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RuleForm } from './RuleForm';
import type { RuleDraft } from './ruleDraft';

const makeDraft = (overrides: Partial<RuleDraft> = {}): RuleDraft => ({
  name: '',
  pattern: '',
  kind: 'glob',
  methods: [],
  responseOps: [],
  rewriteBody: '',
  ...overrides,
});

type Setup = {
  draft?: RuleDraft;
  onSave?: () => Promise<{ ok: boolean; error?: string }>;
};

const setup = ({ draft = makeDraft(), onSave }: Setup = {}) => {
  const onDraftChange = vi.fn<(next: RuleDraft) => void>();
  const onSaveFn = onSave ?? vi.fn<() => Promise<{ ok: boolean; error?: string }>>().mockResolvedValue({ ok: true });
  const onCancel = vi.fn<() => void>();
  render(<RuleForm draft={draft} onDraftChange={onDraftChange} onSave={onSaveFn} onCancel={onCancel} />);
  return { onDraftChange, onSave: onSaveFn, onCancel };
};

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

describe('RuleForm', () => {
  it('should prefill the name, url pattern and kind from the draft', () => {
    // behavior: the controlled view mirrors the passed draft's match fields
    setup({ draft: makeDraft({ name: 'prefilled rule', pattern: 'https://prefill.test/*', kind: 'regex' }) });

    expect(getNameInput()).toHaveValue('prefilled rule');
    expect(getUrlPatternInput()).toHaveValue('https://prefill.test/*');
    expect(getKindSelect()).toHaveTextContent(/regex/i);
  });

  it('should prefill the checked methods from the draft', () => {
    // behavior: selected methods reflect the draft
    setup({ draft: makeDraft({ methods: ['GET'] }) });

    expect(screen.getByRole('checkbox', { name: 'GET' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'POST' })).not.toBeChecked();
  });

  it('should prefill the response header ops and body from the draft', () => {
    // behavior: the Response tab mirrors the draft's ops and body
    setup({
      draft: makeDraft({
        responseOps: [{ op: 'set', name: 'X-Env', value: 'staging' }],
        rewriteBody: '{"pre":true}',
      }),
    });
    gotoResponse();

    expect(getBody()).toHaveValue('{"pre":true}');
    expect(screen.getByLabelText(/Modify response headers name 0/i)).toHaveValue('X-Env');
  });

  it('should call onDraftChange with the new name if the name field is edited', () => {
    // side-effect-contract: name edits emit a patched draft
    const { onDraftChange } = setup({ draft: makeDraft({ pattern: 'https://x.test/*' }) });

    fireEvent.change(getNameInput(), { target: { value: 'my new rule' } });

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'my new rule', pattern: 'https://x.test/*' }));
  });

  it('should call onDraftChange with the new url pattern if the pattern field is edited', () => {
    // side-effect-contract: pattern edits emit a patched draft
    const { onDraftChange } = setup();

    fireEvent.change(getUrlPatternInput(), { target: { value: 'https://api.test.dev/*' } });

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ pattern: 'https://api.test.dev/*' }));
  });

  it('should call onDraftChange adding the method if a method checkbox is toggled on', () => {
    // side-effect-contract: toggling GET emits a draft carrying that method
    const { onDraftChange } = setup({ draft: makeDraft({ methods: [] }) });

    fireEvent.click(screen.getByRole('checkbox', { name: 'GET' }));

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ methods: ['GET'] }));
  });

  it('should call onDraftChange with the new kind if regex is selected', () => {
    // side-effect-contract: choosing a kind emits a patched draft
    const { onDraftChange } = setup();

    selectOption(getKindSelect(), /regex/i);

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'regex' }));
  });

  it('should call onDraftChange with the new body if the body field is edited', () => {
    // side-effect-contract: body edits emit a patched draft
    const { onDraftChange } = setup();
    gotoResponse();

    fireEvent.change(getBody(), { target: { value: '<p>x</p>' } });

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ rewriteBody: '<p>x</p>' }));
  });

  it('should call onSave when the Save button is clicked', async () => {
    // side-effect-contract: Save delegates persistence to onSave
    const { onSave } = setup({ draft: makeDraft({ pattern: 'https://api.test.dev/*' }) });

    fireEvent.click(getSaveButton());

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('should render the error inline when onSave resolves not ok', async () => {
    // behavior: a failed save surfaces the returned error in the form
    const onSave = vi.fn<() => Promise<{ ok: boolean; error?: string }>>().mockResolvedValue({ ok: false, error: 'URL pattern is required.' });
    setup({ onSave });

    fireEvent.click(getSaveButton());

    expect(await screen.findByText(/url pattern is required/i)).toBeInTheDocument();
  });

  it('should call onCancel (not onSave) when the Cancel button is clicked', () => {
    // side-effect-contract: the editor Cancel is an intentional discard
    const { onSave, onCancel } = setup();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('should report a positive match in the URL tester', async () => {
    // behavior: the tester reports a match against the draft pattern
    setup({ draft: makeDraft({ pattern: 'https://api.test.dev/*' }) });

    fireEvent.change(screen.getByLabelText(/test url/i), { target: { value: 'https://api.test.dev/users' } });

    expect(await screen.findByText(/matches/i)).toBeInTheDocument();
  });

  it('should report a non-match in the URL tester', async () => {
    // behavior: the tester reports a non-match against the draft pattern
    setup({ draft: makeDraft({ pattern: 'https://api.test.dev/*' }) });

    fireEvent.change(screen.getByLabelText(/test url/i), { target: { value: 'https://other.dev/x' } });

    expect(await screen.findByText(/does not match/i)).toBeInTheDocument();
  });
});
