import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Rule } from '../../rules/model';
import type { ImportOutcome, UiGateway } from './gateway';
import { RulesProvider, useRules } from './RulesProvider';

type FakeGateway = UiGateway & {
  getAll: ReturnType<typeof vi.fn>;
  getGlobalEnabled: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reorder: ReturnType<typeof vi.fn>;
  setGlobalEnabled: ReturnType<typeof vi.fn>;
  exportToFile: ReturnType<typeof vi.fn>;
  importFromFile: ReturnType<typeof vi.fn>;
};

const createFakeGateway = (overrides: Partial<FakeGateway> = {}): FakeGateway => ({
  getAll: vi.fn<() => Promise<Rule[]>>().mockResolvedValue([]),
  getGlobalEnabled: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  add: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  update: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  remove: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  reorder: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  setGlobalEnabled: vi.fn<(enabled: boolean) => Promise<void>>().mockResolvedValue(undefined),
  exportToFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  importFromFile: vi.fn<(json: string) => Promise<ImportOutcome>>().mockResolvedValue({ ok: true }),
  ...overrides,
});

const StatusProbe = () => {
  const { status, rules, error } = useRules();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="count">{rules.length}</span>
      <span data-testid="error">{error ?? ''}</span>
    </div>
  );
};

const renderProbe = (gateway: UiGateway) =>
  render(
    <RulesProvider gateway={gateway}>
      <StatusProbe />
    </RulesProvider>,
  );

describe('RulesProvider load lifecycle (UI states)', () => {
  it('should start in loading status before the gateway resolves', () => {
    let resolveAll: (rules: Rule[]) => void = () => {};
    const gateway = createFakeGateway({
      getAll: vi.fn<() => Promise<Rule[]>>().mockReturnValue(
        new Promise<Rule[]>((resolve) => {
          resolveAll = resolve;
        }),
      ),
    });

    renderProbe(gateway);

    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    resolveAll([]);
  });

  it('should reach ready status after a successful load (success UI state)', async () => {
    const gateway = createFakeGateway();
    renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('should reach error status and expose an error message when load fails (error UI state)', async () => {
    const gateway = createFakeGateway({
      getAll: vi.fn<() => Promise<Rule[]>>().mockRejectedValue(new Error('storage down')),
    });
    renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent('storage down');
  });

  it('should expose error status when the initial load fails', async () => {
    const gateway = createFakeGateway({
      getAll: vi.fn<() => Promise<Rule[]>>().mockRejectedValue(new Error('boom')),
    });
    renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent('boom');
  });
});
