import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FolderNode, Rule, RuleNode, TreeNode } from '../../rules/model';
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

const buildRule = (id: string): Rule => ({
  id,
  name: id,
  enabled: true,
  matchers: { url: { pattern: `https://${id}.test/*`, kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
});

const ruleNode = (id: string): RuleNode => ({ kind: 'rule', rule: buildRule(id) });

const folder = (id: string, children: TreeNode[] = []): FolderNode => ({
  kind: 'folder',
  id,
  name: id,
  collapsed: false,
  children,
});

const DuplicateFolderProbe = ({ folderId }: { folderId: string }) => {
  const { rules, duplicateFolder } = useRules();
  return (
    <div>
      <span data-testid="count">{rules.length}</span>
      <button type="button" onClick={() => void duplicateFolder(folderId)}>
        dup
      </button>
    </div>
  );
};

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

describe('RulesProvider.duplicateFolder', () => {
  it('should call gateway.duplicateNode once with the folder id (TC-008, side-effect-contract)', async () => {
    const gateway = createFakeGateway([folder('f', [ruleNode('r1'), ruleNode('r2')])]);
    render(
      <RulesProvider gateway={gateway}>
        <DuplicateFolderProbe folderId="f" />
      </RulesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));

    fireEvent.click(screen.getByRole('button', { name: 'dup' }));

    await waitFor(() => expect(gateway.duplicateNode).toHaveBeenCalledTimes(1));
    expect(gateway.duplicateNode).toHaveBeenCalledWith('f');
  });

  it('should refresh the workspace after duplicating so the clone is visible (TC-008)', async () => {
    const gateway = createFakeGateway([folder('f', [ruleNode('r1'), ruleNode('r2')])]);
    render(
      <RulesProvider gateway={gateway}>
        <DuplicateFolderProbe folderId="f" />
      </RulesProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));

    fireEvent.click(screen.getByRole('button', { name: 'dup' }));

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('4'));
  });
});
