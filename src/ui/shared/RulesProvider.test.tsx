import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { TreeNode } from '../../rules/model';
import type { UiGateway } from './gateway';
import { RulesProvider, useRules } from './RulesProvider';
import { createFakeGateway } from './test-gateway';

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
    let resolveAll: (tree: TreeNode[]) => void = () => {};
    const gateway = createFakeGateway();
    gateway.getWorkspace.mockReturnValue(
      new Promise<TreeNode[]>((resolve) => {
        resolveAll = resolve;
      }),
    );

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
    const gateway = createFakeGateway();
    gateway.getWorkspace.mockRejectedValue(new Error('storage down'));
    renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent('storage down');
  });

  it('should expose error status when the initial load fails', async () => {
    const gateway = createFakeGateway();
    gateway.getWorkspace.mockRejectedValue(new Error('boom'));
    renderProbe(gateway);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent('boom');
  });
});
