// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { RuleForm } from './RuleForm';
import type { RuleDraft } from './ruleDraft';

const makeDraft = (overrides: Partial<RuleDraft> = {}): RuleDraft => ({
  name: '',
  pattern: '',
  kind: 'glob',
  methods: [],
  responseOps: [],
  rewriteBody: '',
  requestOps: [],
  requestBody: '',
  ...overrides,
});

type Setup = {
  draft?: RuleDraft;
  onSave?: () => Promise<{ ok: boolean; error?: string }>;
};

const setup = ({ draft = makeDraft(), onSave }: Setup = {}) => {
  const onDraftChange = vi.fn<(next: RuleDraft) => void>();
  const onSaveFn = onSave ?? vi.fn<() => Promise<{ ok: boolean; error?: string }>>().mockResolvedValue({ ok: true });
  render(
    <HotkeysProvider>
      <RuleForm draft={draft} onDraftChange={onDraftChange} onSave={onSaveFn} />
    </HotkeysProvider>,
  );
  return { onDraftChange, onSave: onSaveFn };
};

const getNameInput = () => screen.getByLabelText(/name/i);
const getUrlPatternInput = () => screen.getByLabelText(/url pattern/i);
const getKindSelect = () => screen.getByRole('combobox', { name: /pattern kind/i });
const getBody = () => screen.getByLabelText(/rewrite response body/i);
// jsdom reports a non-mac platform, so the lib resolves Mod -> Control.
const pressSaveChord = async () => {
  await userEvent.keyboard('{Control>}s{/Control}');
};
const gotoResponse = () => fireEvent.click(screen.getByRole('tab', { name: /response/i }));
const gotoRequest = () => fireEvent.click(screen.getByRole('tab', { name: /request/i }));
const getRequestBody = () => screen.getByLabelText(/rewrite request body/i);
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

  it('should call onSave when the Mod+S save chord is pressed', async () => {
    // side-effect-contract: the save chord delegates persistence to onSave
    const { onSave } = setup({ draft: makeDraft({ pattern: 'https://api.test.dev/*' }) });

    await pressSaveChord();

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('should call onSave from the save chord even when a text field is focused', async () => {
    // behavior: Mod combos fire from inside inputs (the native save must not win)
    const { onSave } = setup({ draft: makeDraft({ pattern: 'https://api.test.dev/*' }) });
    getNameInput().focus();

    await pressSaveChord();

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('should not render Save or Cancel buttons', () => {
    // behavior: the editor has no persistence buttons - save is the Mod+S chord
    setup();

    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it('should render the error inline when onSave resolves not ok', async () => {
    // behavior: a failed save surfaces the returned error in the form
    const onSave = vi.fn<() => Promise<{ ok: boolean; error?: string }>>().mockResolvedValue({ ok: false, error: 'URL pattern is required.' });
    setup({ onSave });

    await pressSaveChord();

    expect(await screen.findByText(/url pattern is required/i)).toBeInTheDocument();
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

  it('should render a Request tab that reveals the request header editor and request body textarea when selected (TC-012)', () => {
    // behavior: the Request tab exposes a header editor and a request body textarea
    setup();

    expect(screen.getByRole('tab', { name: /request/i })).toBeInTheDocument();
    gotoRequest();

    expect(getRequestBody()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add .*request headers/i })).toBeInTheDocument();
  });

  it('should prefill the request header ops and request body from the draft (TC-012)', () => {
    // behavior: the Request tab mirrors the draft's request ops and body
    setup({
      draft: makeDraft({
        requestOps: [{ op: 'set', name: 'X-Env', value: 'staging' }],
        requestBody: '{"q":2}',
      }),
    });
    gotoRequest();

    expect(getRequestBody()).toHaveValue('{"q":2}');
    expect(screen.getByLabelText(/request headers name 0/i)).toHaveValue('X-Env');
  });

  it('should call onDraftChange with the new requestBody if the request body field is edited (TC-012)', () => {
    // side-effect-contract: request body edits emit a patched draft
    const { onDraftChange } = setup();
    gotoRequest();

    fireEvent.change(getRequestBody(), { target: { value: '{"q":9}' } });

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ requestBody: '{"q":9}' }));
  });

  it('should call onDraftChange with updated requestOps if a request header name is edited (TC-012)', () => {
    // side-effect-contract: request header edits emit a patched draft carrying requestOps
    const { onDraftChange } = setup({
      draft: makeDraft({ requestOps: [{ op: 'set', name: 'X-Env', value: 'staging' }] }),
    });
    gotoRequest();

    fireEvent.change(screen.getByLabelText(/request headers name 0/i), { target: { value: 'X-New' } });

    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ requestOps: [{ op: 'set', name: 'X-New', value: 'staging' }] }),
    );
  });
});
