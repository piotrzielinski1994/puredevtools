// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { FolderNode, Rule, RuleNode, TreeNode } from '../../rules/model';
import { RulesProvider } from '../shared/RulesProvider';
import { createFakeGateway } from '../shared/test-gateway';
import { PopupTree } from './PopupTree';

const buildRule = (id: string): Rule => ({
  id,
  name: id,
  enabled: true,
  matchers: { url: { pattern: `https://${id}.test/*`, kind: 'glob' } },
  actions: [],
});

const ruleNode = (id: string): RuleNode => ({ kind: 'rule', rule: buildRule(id) });

const folder = (id: string, children: TreeNode[] = [], collapsed = false): FolderNode => ({
  kind: 'folder',
  id,
  name: id,
  collapsed,
  children,
});

const renderPopup = (initial: TreeNode[], onEdit = vi.fn()) => {
  const gateway = createFakeGateway(initial);
  render(
    <RulesProvider gateway={gateway}>
      <PopupTree onEdit={onEdit} />
    </RulesProvider>,
  );
  return { gateway, onEdit };
};

afterEach(() => vi.restoreAllMocks());

describe('PopupTree', () => {
  it('should render the folder tree with rules (AC-013)', async () => {
    renderPopup([folder('f', [ruleNode('r1')]), ruleNode('r2')]);
    expect(await screen.findByLabelText('Folder: f')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit: r1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit: r2' })).toBeInTheDocument();
  });

  it('should collapse a folder when its row is clicked (AC-013)', async () => {
    const { gateway } = renderPopup([folder('f', [ruleNode('child')])]);
    const row = await screen.findByLabelText('Folder: f');
    expect(screen.getByRole('button', { name: 'Edit: child' })).toBeInTheDocument();

    fireEvent.click(row);

    await waitFor(() => expect(gateway.toggleCollapse).toHaveBeenCalledWith('f'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit: child' })).not.toBeInTheDocument());
  });

  it('should render no drag handles and no folder CRUD controls (AC-013)', async () => {
    renderPopup([folder('f', [ruleNode('r1')])]);
    await screen.findByLabelText('Folder: f');
    expect(screen.queryByRole('button', { name: /new folder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('treeitem')).not.toBeInTheDocument();
  });

  it('should call onEdit when a rule is clicked (AC-013)', async () => {
    const { onEdit } = renderPopup([ruleNode('r1')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit: r1' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('should toggle a rule enabled state via its switch', async () => {
    const { gateway } = renderPopup([ruleNode('r1')]);
    fireEvent.click(await screen.findByRole('switch', { name: 'Enabled: r1' }));
    await waitFor(() => expect(gateway.updateRule).toHaveBeenCalledTimes(1));
  });

  it('should show the empty state if there are no rules', async () => {
    renderPopup([]);
    expect(await screen.findByText(/no rules yet/i)).toBeInTheDocument();
  });
});
