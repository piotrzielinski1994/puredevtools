// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Rule, TreeNode } from '../../rules/model';
import type { UiGateway } from './gateway';
import { RulesProvider } from './RulesProvider';
import { OptionsWorkspace } from './OptionsWorkspace';
import { createFakeGateway, ruleNodes, type FakeGateway } from './test-gateway';
import type { OpenTabsState, TabsStore } from './useOpenTabs';

const createFakeTabsStore = (): TabsStore => {
  let state: OpenTabsState = { openKeys: [], activeKey: null };
  return {
    load: async () => state,
    save: (next) => {
      state = next;
    },
  };
};

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

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'rule one',
  enabled: true,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
  ...overrides,
});

const threeRules = (): Rule[] => [
  buildRule({ id: 'a', name: 'alpha rule', matchers: { url: { pattern: 'https://alpha.test/*', kind: 'glob' } } }),
  buildRule({ id: 'b', name: 'bravo rule', matchers: { url: { pattern: 'https://bravo.test/*', kind: 'glob' } } }),
  buildRule({ id: 'c', name: 'charlie rule', matchers: { url: { pattern: 'https://charlie.test/*', kind: 'glob' } } }),
];

const createGatewayWith = (rules: Rule[], globalEnabled = true): FakeGateway =>
  createFakeGateway(ruleNodes(rules), globalEnabled);

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
    renderWorkspace(createGatewayWith(threeRules()));

    await screen.findByRole('button', { name: 'New rule' });
    expect(screen.getByRole('button', { name: /switch to (light|dark) theme/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /global enabled/i })).toBeInTheDocument();
  });

  it('should keep the full rule list in the sidebar while a rule is being edited (AC-002)', async () => {
    // behavior: sidebar list stays visible when the editor is open
    renderWorkspace(createGatewayWith(threeRules()));

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));

    await screen.findByLabelText('URL pattern');
    expect(screen.getAllByRole('button', { name: /edit:/i })).toHaveLength(3);
  });

  it('should open a rule from the sidebar as an active editor tab (AC-003)', async () => {
    // behavior: clicking Edit opens that rule's editor on the right
    renderWorkspace(createGatewayWith(threeRules()));

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
    renderWorkspace(createGatewayWith(threeRules()));

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
    renderWorkspace(createGatewayWith(threeRules()));

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');
    fireEvent.click(editButton('alpha rule'));

    await waitFor(() => expect(urlPatternValue()).toBe('https://alpha.test/*'));
    expect(screen.getAllByRole('button', { name: /close alpha rule/i })).toHaveLength(1);
  });

  it('should open an empty draft editor when New rule is clicked (AC-005, TC-003)', async () => {
    // behavior: New rule opens a blank draft tab with an empty form
    renderWorkspace(createGatewayWith(threeRules()));

    await screen.findByRole('button', { name: 'New rule' });
    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));

    await screen.findByLabelText('URL pattern');
    expect(urlPatternValue()).toBe('');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/select a rule to edit/i)).not.toBeInTheDocument();
  });

  it('should keep a single draft tab if New rule is clicked while a draft is already open (E-1)', async () => {
    // behavior: re-adding a draft re-activates the one draft, never a second
    renderWorkspace(createGatewayWith(threeRules()));

    const newRule = await screen.findByRole('button', { name: 'New rule' });
    fireEvent.click(newRule);
    await screen.findByLabelText('URL pattern');
    fireEvent.click(newRule);

    await waitFor(() => expect(screen.getAllByRole('button', { name: /close new rule/i })).toHaveLength(1));
  });

  it('should show the empty-state hint plus a New rule action when no tabs are open (AC-008, TC-005)', async () => {
    // behavior: closing the last tab returns to the empty state
    renderWorkspace(createGatewayWith(threeRules()));

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
    renderWorkspace(createGatewayWith(threeRules()));

    await screen.findByRole('button', { name: 'New rule' });
    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));

    await screen.findByLabelText('URL pattern');
    expect(urlPatternValue()).toBe('');
  });

  it('should persist and keep the tab open when the editor is saved (AC-009, TC-006)', async () => {
    // side-effect-contract: Save calls gateway.updateRule and leaves the active tab open
    const gateway = createGatewayWith(threeRules());
    renderWorkspace(gateway);

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(gateway.updateRule).toHaveBeenCalledTimes(1));
    const [updated] = gateway.updateRule.mock.calls[0] as [Rule];
    expect(updated.id).toBe('a');
    expect(closeTab('alpha rule')).toBeInTheDocument();
    expect(screen.queryByText(/select a rule to edit/i)).not.toBeInTheDocument();
    expect(urlPatternValue()).toBe('https://alpha.test/*');
  });

  it('should replace the draft tab with the saved rule tab when a new rule is saved (AC-009)', async () => {
    // behavior: saving a draft swaps the draft tab for the persisted rule's tab (no duplicate re-add)
    const gateway = createGatewayWith(threeRules());
    renderWorkspace(gateway);

    await screen.findByRole('button', { name: 'New rule' });
    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));
    await screen.findByLabelText('URL pattern');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'delta rule' } });
    fireEvent.change(screen.getByLabelText('URL pattern'), { target: { value: 'https://delta.test/*' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(gateway.addRule).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: /close delta rule/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close new rule/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(gateway.updateRule).toHaveBeenCalledTimes(1));
    expect(gateway.addRule).toHaveBeenCalledTimes(1);
  });

  it('should close the tab without persisting when the editor is cancelled (AC-009)', async () => {
    // behavior: Cancel closes the tab and does not call gateway.updateRule
    const gateway = createGatewayWith(threeRules());
    renderWorkspace(gateway);

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText(/select a rule to edit/i)).toBeInTheDocument();
    expect(gateway.updateRule).not.toHaveBeenCalled();
  });

  it('should prune the tab of a rule deleted from the sidebar and keep the others (AC-010, TC-007)', async () => {
    // side-effect-contract: deleting an open rule removes its tab, activates a remaining one
    const gateway = createGatewayWith(threeRules());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWorkspace(gateway);

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');
    fireEvent.click(editButton('bravo rule'));
    await waitFor(() => expect(urlPatternValue()).toBe('https://bravo.test/*'));

    clickTab('alpha rule');
    await waitFor(() => expect(urlPatternValue()).toBe('https://alpha.test/*'));

    fireEvent.contextMenu(editButton('alpha rule'));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));

    await waitFor(() => expect(gateway.removeNode).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /close alpha rule/i })).not.toBeInTheDocument());
    expect(closeTab('bravo rule')).toBeInTheDocument();
    await waitFor(() => expect(urlPatternValue()).toBe('https://bravo.test/*'));
  });

  it('should show a loading message while the gateway has not resolved (UI state)', async () => {
    // behavior: loading UI state before rules resolve
    let resolveAll: (tree: TreeNode[]) => void = () => undefined;
    const gateway = createGatewayWith(threeRules());
    gateway.getWorkspace.mockImplementation(() => new Promise<TreeNode[]>((resolve) => { resolveAll = resolve; }));
    renderWorkspace(gateway);

    expect(screen.getByText(/loading rules/i)).toBeInTheDocument();

    resolveAll([]);
    await screen.findByText(/select a rule to edit/i);
  });

  it('should show an error message if loading rules fails (UI state)', async () => {
    // behavior: error UI state when the gateway rejects
    const gateway = createGatewayWith(threeRules());
    gateway.getWorkspace.mockRejectedValue(new Error('storage boom'));
    renderWorkspace(gateway);

    expect(await screen.findByText(/failed to load rules: storage boom/i)).toBeInTheDocument();
  });

  it('should open no tabs on mount when the tabs store is empty (TC-008)', async () => {
    // behavior: an empty store restores nothing - the workspace starts in the empty state
    const gateway = createGatewayWith(threeRules());
    renderWorkspace(gateway);

    expect(await screen.findByText(/select a rule to edit/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close alpha rule/i })).not.toBeInTheDocument();
  });

  it('should restore open tabs from the store on remount but never the draft (AC-001, AC-002, TC-008)', async () => {
    // behavior: a stateful store round-trips open tabs across remounts; the draft is not restored
    const gateway = createGatewayWith(threeRules());
    const tabsStore = createFakeTabsStore();

    const first = render(
      <RulesProvider gateway={gateway}>
        <OptionsWorkspace tabsStore={tabsStore} />
      </RulesProvider>,
    );

    await screen.findByRole('button', { name: 'Edit: alpha rule' });
    fireEvent.click(editButton('alpha rule'));
    await screen.findByLabelText('URL pattern');
    fireEvent.click(screen.getByRole('button', { name: 'New rule' }));
    await waitFor(() => expect(urlPatternValue()).toBe(''));
    first.unmount();

    render(
      <RulesProvider gateway={gateway}>
        <OptionsWorkspace tabsStore={tabsStore} />
      </RulesProvider>,
    );

    expect(await screen.findByRole('button', { name: /close alpha rule/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close new rule/i })).not.toBeInTheDocument();
  });
});
