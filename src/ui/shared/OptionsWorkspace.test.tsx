// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ApplyDiagnostics, Capabilities } from '../../engine/RequestEngine';
import type { Rule } from '../../rules/model';
import type { ImportOutcome, UiGateway } from './gateway';
import { RulesProvider } from './RulesProvider';
import { OptionsWorkspace } from './OptionsWorkspace';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}),
        set: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
      },
    },
  },
}));

type FakeGateway = UiGateway & {
  getAll: ReturnType<typeof vi.fn>;
  getGlobalEnabled: ReturnType<typeof vi.fn>;
  getDiagnostics: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reorder: ReturnType<typeof vi.fn>;
};

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'rule one',
  enabled: true,
  priority: 0,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'block' }],
  ...overrides,
});

const threeRules = (): Rule[] => [
  buildRule({ id: 'a', name: 'alpha rule', priority: 0, matchers: { url: { pattern: 'https://alpha.test/*', kind: 'glob' } } }),
  buildRule({ id: 'b', name: 'bravo rule', priority: 1, matchers: { url: { pattern: 'https://bravo.test/*', kind: 'glob' } } }),
  buildRule({ id: 'c', name: 'charlie rule', priority: 2, matchers: { url: { pattern: 'https://charlie.test/*', kind: 'glob' } } }),
];

const createFakeGateway = (
  initial: Rule[],
  capabilities: Capabilities = { responseBodyRewrite: true, artificialLatency: true },
  globalEnabled = true,
): FakeGateway => {
  let store = [...initial];
  return {
    getAll: vi.fn<() => Promise<Rule[]>>(async () => [...store]),
    getGlobalEnabled: vi.fn<() => Promise<boolean>>(async () => globalEnabled),
    getCapabilities: vi.fn<() => Promise<Capabilities>>(async () => capabilities),
    getDiagnostics: vi.fn<() => Promise<ApplyDiagnostics>>(async () => ({ errors: [], unsupported: [] })),
    add: vi.fn<(rule: Rule) => Promise<void>>(async (rule) => {
      store = [...store, rule];
    }),
    update: vi.fn<(rule: Rule) => Promise<void>>(async (rule) => {
      store = store.map((existing) => (existing.id === rule.id ? rule : existing));
    }),
    remove: vi.fn<(id: string) => Promise<void>>(async (id) => {
      store = store.filter((existing) => existing.id !== id);
    }),
    reorder: vi.fn<(ids: string[]) => Promise<void>>(async (ids) => {
      const byId = new Map(store.map((rule) => [rule.id, rule] as const));
      store = ids.map((id) => byId.get(id)).filter((rule): rule is Rule => rule !== undefined);
    }),
    setGlobalEnabled: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    exportToFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    importFromFile: vi.fn<() => Promise<ImportOutcome>>().mockResolvedValue({ ok: true }),
  };
};

const renderWorkspace = (gateway: UiGateway) =>
  render(
    <RulesProvider gateway={gateway}>
      <OptionsWorkspace />
    </RulesProvider>,
  );

const editButton = (name: string) => screen.getByRole('button', { name: `Edit: ${name}` });
const closeTab = (name: string) => screen.getByRole('button', { name: new RegExp(`close ${name}`, 'i') });
const urlPatternValue = () => (screen.getByLabelText('URL pattern') as HTMLInputElement).value;

const clickTab = (name: string) => {
  const sidebar = screen.getAllByRole('button', { name: /edit:/i })[0].closest('ul');
  const tabNode = screen.getAllByText(name).find((node) => sidebar === null || !sidebar.contains(node));
  if (!tabNode) throw new Error(`tab label not found outside sidebar: ${name}`);
  fireEvent.click(tabNode);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OptionsWorkspace', () => {
  it('should render the shell with a New rule action, theme, and global switch (AC-001)', async () => {
    // behavior: master-detail shell exposes create + theme + global controls
    renderWorkspace(createFakeGateway(threeRules()));

    await screen.findByRole('button', { name: 'New rule' });
    expect(screen.getByRole('button', { name: /switch to (light|dark) theme/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /global enabled/i })).toBeInTheDocument();
  });

  it('should keep the full rule list in the sidebar while a rule is being edited (AC-002)', async () => {
    // behavior: sidebar list stays visible when the editor is open
    renderWorkspace(createFakeGateway(threeRules()));

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));

    await screen.findByLabelText('URL pattern');
    expect(screen.getAllByRole('button', { name: /edit:/i })).toHaveLength(3);
  });

  it('should open a rule from the sidebar as an active editor tab (AC-003)', async () => {
    // behavior: clicking Edit opens that rule's editor on the right
    renderWorkspace(createFakeGateway(threeRules()));

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    expect(screen.getByText(/select a rule to edit/i)).toBeInTheDocument();

    fireEvent.click(editButton('alpha rule'));

    await screen.findByLabelText('URL pattern');
    expect(urlPatternValue()).toBe('https://alpha.test/*');
    expect(closeTab('alpha rule')).toBeInTheDocument();
    expect(screen.queryByText(/select a rule to edit/i)).not.toBeInTheDocument();
  });

  it('should open two rules and switch the editor when a tab is clicked (AC-004, TC-001)', async () => {
    // behavior: two open tabs; clicking a tab activates its editor
    renderWorkspace(createFakeGateway(threeRules()));

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');
    fireEvent.click(editButton('bravo rule'));

    await waitFor(() => expect(urlPatternValue()).toBe('https://bravo.test/*'));
    expect(closeTab('alpha rule')).toBeInTheDocument();
    expect(closeTab('bravo rule')).toBeInTheDocument();

    clickTab('alpha rule');
    await waitFor(() => expect(urlPatternValue()).toBe('https://alpha.test/*'));
  });

  it('should not open a duplicate tab when an already-open rule is reopened (AC-006, TC-002)', async () => {
    // behavior: reopening a rule re-activates its single existing tab
    renderWorkspace(createFakeGateway(threeRules()));

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');
    fireEvent.click(editButton('alpha rule'));

    await waitFor(() => expect(urlPatternValue()).toBe('https://alpha.test/*'));
    expect(screen.getAllByRole('button', { name: /close alpha rule/i })).toHaveLength(1);
  });

  it('should open an empty draft editor when New rule is clicked (AC-005, TC-003)', async () => {
    // behavior: New rule opens a blank draft tab with an empty form
    renderWorkspace(createFakeGateway(threeRules()));

    await screen.findByRole('button', { name: 'New rule' });
    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));

    await screen.findByLabelText('URL pattern');
    expect(urlPatternValue()).toBe('');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/select a rule to edit/i)).not.toBeInTheDocument();
  });

  it('should keep a single draft tab if New rule is clicked while a draft is already open (E-1)', async () => {
    // behavior: re-adding a draft re-activates the one draft, never a second
    renderWorkspace(createFakeGateway(threeRules()));

    const newRule = await screen.findByRole('button', { name: 'New rule' });
    fireEvent.click(newRule);
    await screen.findByLabelText('URL pattern');
    fireEvent.click(newRule);

    await waitFor(() => expect(screen.getAllByRole('button', { name: /close new rule/i })).toHaveLength(1));
  });

  it('should show the empty-state hint plus a New rule action when no tabs are open (AC-008, TC-005)', async () => {
    // behavior: closing the last tab returns to the empty state
    renderWorkspace(createFakeGateway(threeRules()));

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');

    fireEvent.click(closeTab('alpha rule'));

    expect(await screen.findByText(/select a rule to edit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New rule' })).toBeInTheDocument();
    expect(screen.queryByLabelText('URL pattern')).not.toBeInTheDocument();
  });

  it('should open a draft from the New rule button when the editor is empty (AC-008)', async () => {
    // behavior: the always-present New rule action opens a draft editor from the empty state
    renderWorkspace(createFakeGateway(threeRules()));

    await screen.findByRole('button', { name: 'New rule' });
    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));

    await screen.findByLabelText('URL pattern');
    expect(urlPatternValue()).toBe('');
  });

  it('should persist and close the tab when the editor is saved (AC-009, TC-006)', async () => {
    // side-effect-contract: Save calls gateway.update and closes the active tab
    const gateway = createFakeGateway(threeRules());
    renderWorkspace(gateway);

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(gateway.update).toHaveBeenCalledTimes(1));
    const [updated] = gateway.update.mock.calls[0] as [Rule];
    expect(updated.id).toBe('a');
    expect(await screen.findByText(/select a rule to edit/i)).toBeInTheDocument();
  });

  it('should close the tab without persisting when the editor is cancelled (AC-009)', async () => {
    // behavior: Cancel closes the tab and does not call gateway.update
    const gateway = createFakeGateway(threeRules());
    renderWorkspace(gateway);

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText(/select a rule to edit/i)).toBeInTheDocument();
    expect(gateway.update).not.toHaveBeenCalled();
  });

  it('should prune the tab of a rule deleted from the sidebar and keep the others (AC-010, TC-007)', async () => {
    // side-effect-contract: deleting an open rule removes its tab, activates a remaining one
    const gateway = createFakeGateway(threeRules());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWorkspace(gateway);

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');
    fireEvent.click(editButton('bravo rule'));
    await waitFor(() => expect(urlPatternValue()).toBe('https://bravo.test/*'));

    clickTab('alpha rule');
    await waitFor(() => expect(urlPatternValue()).toBe('https://alpha.test/*'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete: alpha rule' }));

    await waitFor(() => expect(gateway.remove).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /close alpha rule/i })).not.toBeInTheDocument());
    expect(closeTab('bravo rule')).toBeInTheDocument();
    await waitFor(() => expect(urlPatternValue()).toBe('https://bravo.test/*'));
  });

  it('should show a loading message while the gateway has not resolved (UI state)', async () => {
    // behavior: loading UI state before rules resolve
    let resolveAll: (rules: Rule[]) => void = () => undefined;
    const gateway = createFakeGateway(threeRules());
    gateway.getAll.mockImplementation(() => new Promise<Rule[]>((resolve) => { resolveAll = resolve; }));
    renderWorkspace(gateway);

    expect(screen.getByText(/loading rules/i)).toBeInTheDocument();

    resolveAll([]);
    await screen.findByText(/select a rule to edit/i);
  });

  it('should show an error message if loading rules fails (UI state)', async () => {
    // behavior: error UI state when the gateway rejects
    const gateway = createFakeGateway(threeRules());
    gateway.getAll.mockRejectedValue(new Error('storage boom'));
    renderWorkspace(gateway);

    expect(await screen.findByText(/failed to load rules: storage boom/i)).toBeInTheDocument();
  });

  it('should surface apply diagnostics errors and unsupported actions (UI state)', async () => {
    // behavior: diagnostics banners render errors + unsupported list
    const gateway = createFakeGateway(threeRules());
    gateway.getDiagnostics.mockResolvedValue({ errors: ['rule x rejected'], unsupported: ['latency'] });
    renderWorkspace(gateway);

    expect(await screen.findByText(/rule x rejected/i)).toBeInTheDocument();
    expect(screen.getByText(/not enforceable on this browser/i)).toBeInTheDocument();
    expect(screen.getByText(/latency/i)).toBeInTheDocument();
  });

  it('should start with no tabs open after a fresh remount (AC-011, TC-008)', async () => {
    // behavior: open tabs are session-only; remounting resets to the empty state
    const gateway = createFakeGateway(threeRules());
    const first = renderWorkspace(gateway);

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');
    first.unmount();

    renderWorkspace(gateway);

    expect(await screen.findByText(/select a rule to edit/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close alpha rule/i })).not.toBeInTheDocument();
  });
});
