import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FolderNode, Rule, RuleNode, TreeNode } from '../../rules/model';
import { RulesProvider } from './RulesProvider';
import { ShortcutsProvider } from './ShortcutsProvider';
import { SidebarTree } from './SidebarTree';
import { createFakeGateway } from './test-gateway';

// The roving-focus tree nav is bound on the ROW keydown (not a global hotkey),
// so it only fires with a row focused. jsdom is non-mac. Tree keys are bare
// arrows / Enter / Alt+Arrow / Shift+F10, platform-independent.

const mock = vi.hoisted(() => ({
  get: vi.fn(async () => ({})),
  set: vi.fn(async () => undefined),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: { get: mock.get, set: mock.set },
      onChanged: { addListener: mock.addListener, removeListener: mock.removeListener },
    },
  },
}));

const buildRule = (id: string): Rule => ({
  id,
  name: id,
  enabled: true,
  matchers: { url: { pattern: `https://${id}.test/*`, kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
});

const ruleNode = (id: string): RuleNode => ({ kind: 'rule', rule: buildRule(id) });

const folder = (id: string, children: TreeNode[] = [], collapsed = false): FolderNode => ({
  kind: 'folder',
  id,
  name: id,
  collapsed,
  children,
});

//   Alpha (folder, collapsed, has a child)
//   Beta  (folder, collapsed)
//   top   (rule)
const fixture: TreeNode[] = [
  folder('Alpha', [ruleNode('inner')], true),
  folder('Beta', [], true),
  ruleNode('top'),
];

const renderTree = (initial: TreeNode[] = fixture, onEdit = vi.fn()) => {
  const gateway = createFakeGateway(initial);
  const utils = render(
    <ShortcutsProvider>
      <RulesProvider gateway={gateway}>
        <SidebarTree onEdit={onEdit} />
      </RulesProvider>
    </ShortcutsProvider>,
  );
  return { gateway, onEdit, ...utils };
};

const row = (name: string) => screen.getByRole('treeitem', { name });

beforeEach(() => {
  mock.set.mockClear();
});

describe('SidebarTree roving-focus navigation', () => {
  // AC-007 behavior: exactly one tree row sits in the Tab order.
  it('should keep exactly one tree row in the Tab order', async () => {
    renderTree();
    await screen.findByLabelText('Folder: Alpha');

    const tabbable = screen
      .getAllByRole('treeitem')
      .filter((el) => el.getAttribute('tabindex') === '0');

    expect(tabbable).toHaveLength(1);
  });

  // TC-019, AC-007 behavior: ArrowDown moves focus to the next visible row.
  it('should move focus down if ArrowDown on a focused row', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByLabelText('Folder: Alpha');

    row('Folder: Alpha').focus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() => expect(row('Folder: Beta')).toHaveFocus());
  });

  // AC-007 behavior: the tabbable row follows the navigated selection.
  it('should move the tabbable row to follow the navigation', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByLabelText('Folder: Alpha');

    row('Folder: Alpha').focus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() => expect(row('Folder: Beta')).toHaveAttribute('tabindex', '0'));
    expect(row('Folder: Alpha')).toHaveAttribute('tabindex', '-1');
  });

  // TC-019 behavior: ArrowUp on the first row is a no-op (focus stays).
  it('should keep focus on the first row if ArrowUp is pressed there', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByLabelText('Folder: Alpha');

    row('Folder: Alpha').focus();
    await user.keyboard('{ArrowUp}');

    expect(row('Folder: Alpha')).toHaveFocus();
  });

  // TC-020, AC-007 behavior: ArrowRight expands a collapsed folder.
  it('should expand a collapsed folder if ArrowRight', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTree();
    await screen.findByLabelText('Folder: Alpha');

    row('Folder: Alpha').focus();
    await user.keyboard('{ArrowRight}');

    await waitFor(() => expect(gateway.toggleCollapse).toHaveBeenCalledWith('Alpha'));
  });

  // TC-021, AC-007 behavior: Enter on a rule row opens it (onEdit).
  it('should open a rule if Enter on a focused rule row', async () => {
    const user = userEvent.setup();
    const { onEdit } = renderTree();
    const editButton = await screen.findByRole('button', { name: 'Edit: top' });
    const topRow = editButton.closest('[role="treeitem"]') as HTMLElement;

    topRow.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('top'));
  });

  // TC-021, AC-007 behavior: Enter on a folder toggles it.
  it('should toggle a folder if Enter on a focused folder row', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTree();
    await screen.findByLabelText('Folder: Alpha');

    row('Folder: Alpha').focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(gateway.toggleCollapse).toHaveBeenCalledWith('Alpha'));
  });

  // TC-022, AC-007 side-effect-contract: Alt+ArrowDown reorders via moveNode.
  it('should reorder a row down among siblings if Alt+ArrowDown', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTree();
    await screen.findByLabelText('Folder: Alpha');

    row('Folder: Alpha').focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    await waitFor(() => expect(gateway.moveNode).toHaveBeenCalled());
    const [dragId, target] = gateway.moveNode.mock.calls.at(-1) as [string, { parentId: string | null; index: number }];
    expect(dragId).toBe('Alpha');
    expect(target).toEqual({ parentId: null, index: 1 });
  });

  // TC-022, AC-007 behavior: Alt+ArrowUp on the first sibling is a no-op.
  it('should not reorder if Alt+ArrowUp on the first sibling', async () => {
    const user = userEvent.setup();
    const { gateway } = renderTree();
    await screen.findByLabelText('Folder: Alpha');

    row('Folder: Alpha').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    expect(gateway.moveNode).not.toHaveBeenCalled();
  });

  // TC-023, AC-007 behavior: Shift+F10 opens the focused row context menu.
  it('should open the row context menu if Shift+F10 is pressed on a focused row', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByLabelText('Folder: Alpha');

    row('Folder: Alpha').focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');

    expect(await screen.findByRole('menuitem', { name: /rename/i })).toBeInTheDocument();
  });
});
