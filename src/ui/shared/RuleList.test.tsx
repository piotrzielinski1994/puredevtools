import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Capabilities } from '../../engine/RequestEngine';
import type { Rule } from '../../rules/model';
import type { ImportOutcome, UiGateway } from './gateway';
import { RulesProvider } from './RulesProvider';
import { RuleList } from './RuleList';

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'rule one',
  enabled: true,
  priority: 0,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'block' }],
  ...overrides,
});

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
  rules: Rule[],
  capabilities: Capabilities = { responseBodyRewrite: true, artificialLatency: true },
  globalEnabled = true,
): FakeGateway => ({
  getAll: vi.fn<() => Promise<Rule[]>>().mockResolvedValue(rules),
  getGlobalEnabled: vi.fn<() => Promise<boolean>>().mockResolvedValue(globalEnabled),
  getCapabilities: vi.fn<() => Promise<Capabilities>>().mockResolvedValue(capabilities),
  add: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  update: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  remove: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  reorder: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  setGlobalEnabled: vi.fn<(enabled: boolean) => Promise<void>>().mockResolvedValue(undefined),
  exportToFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  importFromFile: vi.fn<(json: string) => Promise<ImportOutcome>>().mockResolvedValue({ ok: true }),
});

const threeRules = (): Rule[] => [
  buildRule({ id: 'a', name: 'alpha rule', priority: 0 }),
  buildRule({ id: 'b', name: 'bravo rule', priority: 1 }),
  buildRule({ id: 'c', name: 'charlie rule', priority: 2 }),
];

const renderList = (gateway: UiGateway, onEdit = vi.fn()) =>
  render(
    <RulesProvider gateway={gateway}>
      <RuleList onEdit={onEdit} />
    </RulesProvider>,
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RuleList', () => {
  it('should render all rules in priority order with controls per row (AC-001)', async () => {
    const gateway = createFakeGateway(threeRules());
    renderList(gateway);

    await screen.findByText('alpha rule');

    const names = screen.getAllByText(/rule$/).map((node) => node.textContent);
    expect(names).toEqual(['alpha rule', 'bravo rule', 'charlie rule']);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    const firstRow = within(rows[0]);
    expect(firstRow.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(firstRow.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(firstRow.getByRole('button', { name: /move up/i })).toBeInTheDocument();
    expect(firstRow.getByRole('button', { name: /move down/i })).toBeInTheDocument();
    expect(firstRow.getByRole('switch', { name: /enabled/i })).toBeInTheDocument();
  });

  it('should call gateway.update with enabled flipped when the toggle is clicked (AC-002)', async () => {
    const gateway = createFakeGateway(threeRules());
    renderList(gateway);

    await screen.findByText('alpha rule');

    const rows = screen.getAllByRole('listitem');
    const toggle = within(rows[0]).getByRole('switch', { name: /enabled/i });
    fireEvent.click(toggle);

    await waitFor(() => expect(gateway.update).toHaveBeenCalledTimes(1));
    const [updated] = gateway.update.mock.calls[0] as [Rule];
    expect(updated.id).toBe('a');
    expect(updated.enabled).toBe(false);
  });

  it('should call gateway.reorder with the new id order when move up is clicked (AC-005)', async () => {
    const gateway = createFakeGateway(threeRules());
    renderList(gateway);

    await screen.findByText('alpha rule');

    const rows = screen.getAllByRole('listitem');
    const moveUp = within(rows[1]).getByRole('button', { name: /move up/i });
    fireEvent.click(moveUp);

    await waitFor(() => expect(gateway.reorder).toHaveBeenCalledTimes(1));
    const [ids] = gateway.reorder.mock.calls[0] as [string[]];
    expect(ids).toEqual(['b', 'a', 'c']);
  });

  it('should disable move up on the first row and move down on the last row (AC-005 boundary)', async () => {
    const gateway = createFakeGateway(threeRules());
    renderList(gateway);

    await screen.findByText('alpha rule');

    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByRole('button', { name: /move up/i })).toBeDisabled();
    expect(within(rows[2]).getByRole('button', { name: /move down/i })).toBeDisabled();
  });

  it('should call gateway.remove after confirm returns true (AC-006)', async () => {
    const gateway = createFakeGateway(threeRules());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderList(gateway);

    await screen.findByText('alpha rule');

    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(gateway.remove).toHaveBeenCalledTimes(1));
    expect(gateway.remove).toHaveBeenCalledWith('a');
  });

  it('should NOT call gateway.remove when confirm returns false (AC-006)', async () => {
    const gateway = createFakeGateway(threeRules());
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderList(gateway);

    await screen.findByText('alpha rule');

    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /delete/i }));

    expect(gateway.remove).not.toHaveBeenCalled();
  });

  it('should render an empty state when there are no rules (UI state)', async () => {
    const gateway = createFakeGateway([]);
    renderList(gateway);

    expect(await screen.findByText(/no rules/i)).toBeInTheDocument();
  });

  it('should render only the name and enabled switch per row in compact mode', async () => {
    const gateway = createFakeGateway(threeRules());
    render(
      <RulesProvider gateway={gateway}>
        <RuleList compact onEdit={vi.fn()} />
      </RulesProvider>,
    );

    await screen.findByText('alpha rule');

    const rows = screen.getAllByRole('listitem');
    const firstRow = within(rows[0]);
    expect(firstRow.getByRole('switch', { name: /enabled/i })).toBeInTheDocument();
    expect(firstRow.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(firstRow.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(firstRow.queryByRole('button', { name: /move up/i })).not.toBeInTheDocument();
  });

  it('should still toggle enabled in compact mode', async () => {
    const gateway = createFakeGateway(threeRules());
    render(
      <RulesProvider gateway={gateway}>
        <RuleList compact onEdit={vi.fn()} />
      </RulesProvider>,
    );

    await screen.findByText('alpha rule');

    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('switch', { name: /enabled/i }));

    await waitFor(() => expect(gateway.update).toHaveBeenCalledTimes(1));
    const [updated] = gateway.update.mock.calls[0] as [Rule];
    expect(updated.enabled).toBe(false);
  });

  it('should add a cloned rule with a fresh id and (copy) name when Duplicate is clicked', async () => {
    const gateway = createFakeGateway(threeRules());
    renderList(gateway);

    await screen.findByText('alpha rule');

    const rows = screen.getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /duplicate/i }));

    await waitFor(() => expect(gateway.add).toHaveBeenCalledTimes(1));
    const [added] = gateway.add.mock.calls[0] as [Rule];
    expect(added.id).toBe('a-copy');
    expect(added.name).toBe('alpha rule (copy)');
  });

  it('should show only rules matching the filter by name or url', async () => {
    const gateway = createFakeGateway(threeRules());
    render(
      <RulesProvider gateway={gateway}>
        <RuleList filter="bravo" onEdit={vi.fn()} />
      </RulesProvider>,
    );

    await screen.findByText('bravo rule');
    expect(screen.queryByText('alpha rule')).not.toBeInTheDocument();
    expect(screen.queryByText('charlie rule')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('should show a no-match message when the filter matches nothing', async () => {
    const gateway = createFakeGateway(threeRules());
    render(
      <RulesProvider gateway={gateway}>
        <RuleList filter="zzz-nope" onEdit={vi.fn()} />
      </RulesProvider>,
    );

    expect(await screen.findByText(/no rules match/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('should disable reorder while a filter is active', async () => {
    const gateway = createFakeGateway(threeRules());
    render(
      <RulesProvider gateway={gateway}>
        <RuleList filter="rule" onEdit={vi.fn()} />
      </RulesProvider>,
    );

    await screen.findByText('alpha rule');
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[1]).getByRole('button', { name: /move up/i })).toBeDisabled();
  });
});
