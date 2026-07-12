// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { FolderNode, Rule, RuleNode, TreeNode } from '../../rules/model';
import { RulesProvider } from './RulesProvider';
import { SidebarTree } from './SidebarTree';
import { createFakeGateway } from './test-gateway';

const buildRule = (id: string, overrides: Partial<Rule> = {}): Rule => ({
  id,
  name: id,
  enabled: true,
  matchers: { url: { pattern: `https://${id}.test/*`, kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
  ...overrides,
});

const ruleNode = (id: string, overrides: Partial<Rule> = {}): RuleNode => ({
  kind: 'rule',
  rule: buildRule(id, overrides),
});

const folder = (id: string, children: TreeNode[] = [], collapsed = false): FolderNode => ({
  kind: 'folder',
  id,
  name: id,
  collapsed,
  children,
});

const renderTree = (initial: TreeNode[], onEdit = vi.fn(), filter = '') => {
  const gateway = createFakeGateway(initial);
  const utils = render(
    <RulesProvider gateway={gateway}>
      <SidebarTree onEdit={onEdit} filter={filter} />
    </RulesProvider>,
  );
  return { gateway, onEdit, ...utils };
};

afterEach(() => vi.restoreAllMocks());

describe('SidebarTree rendering', () => {
  it('should render a nested tree of folders and rules to arbitrary depth (AC-001, TC-018)', async () => {
    renderTree([folder('outer', [folder('inner', [ruleNode('deep')]), ruleNode('mid')]), ruleNode('top')]);

    expect(await screen.findByRole('button', { name: 'Edit: deep' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit: mid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit: top' })).toBeInTheDocument();
    expect(screen.getByLabelText('Folder: outer')).toBeInTheDocument();
    expect(screen.getByLabelText('Folder: inner')).toBeInTheDocument();
  });

  it('should show the empty state if the workspace has no nodes', async () => {
    renderTree([]);
    expect(await screen.findByText(/no rules yet/i)).toBeInTheDocument();
  });
});

describe('SidebarTree folder CRUD', () => {
  it('should call addFolder(null) when the New folder bar button is clicked (AC-007)', async () => {
    const { gateway } = renderTree([ruleNode('r1')]);
    await screen.findByRole('button', { name: 'Edit: r1' });

    fireEvent.click(screen.getByRole('button', { name: /new folder/i }));

    await waitFor(() => expect(gateway.addFolder).toHaveBeenCalledWith(null));
  });

  it('should open the newly created folder in inline-rename mode (AC-007, TC-009)', async () => {
    const { gateway } = renderTree([ruleNode('r1')]);
    await screen.findByRole('button', { name: 'Edit: r1' });

    fireEvent.click(screen.getByRole('button', { name: /new folder/i }));

    const input = await screen.findByRole('textbox', { name: /rename folder/i });
    fireEvent.change(input, { target: { value: 'API' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(gateway.renameFolder).toHaveBeenCalled());
    const [, name] = gateway.renameFolder.mock.calls[0] as [string, string];
    expect(name).toBe('API');
  });

  it('should create a folder inside a folder from its context menu (AC-007)', async () => {
    const { gateway } = renderTree([folder('parent')]);
    const row = await screen.findByLabelText('Folder: parent');

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: /new folder/i }));

    await waitFor(() => expect(gateway.addFolder).toHaveBeenCalledWith('parent'));
  });

  it('should rename a folder via the context menu inline input (AC-008)', async () => {
    const { gateway } = renderTree([folder('f')]);
    const row = await screen.findByLabelText('Folder: f');

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: /rename/i }));

    const input = await screen.findByRole('textbox', { name: /rename folder/i });
    fireEvent.change(input, { target: { value: 'Auth' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(gateway.renameFolder).toHaveBeenCalledWith('f', 'Auth'));
  });

  it('should cancel a rename on Escape without calling renameFolder (AC-008)', async () => {
    const { gateway } = renderTree([folder('f')]);
    fireEvent.doubleClick(await screen.findByLabelText('Folder: f'));

    const input = await screen.findByRole('textbox', { name: /rename folder/i });
    fireEvent.change(input, { target: { value: 'nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('textbox', { name: /rename folder/i })).not.toBeInTheDocument());
    expect(gateway.renameFolder).not.toHaveBeenCalled();
  });

  it('should delete a folder and its subtree after a confirm (AC-009)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway } = renderTree([folder('f', [ruleNode('r1')])]);
    const row = await screen.findByLabelText('Folder: f');

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));

    await waitFor(() => expect(gateway.removeNode).toHaveBeenCalledWith('f'));
  });

  it('should not delete a folder if the confirm is cancelled (AC-009)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { gateway } = renderTree([folder('f', [ruleNode('r1')])]);
    const row = await screen.findByLabelText('Folder: f');

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));

    expect(gateway.removeNode).not.toHaveBeenCalled();
  });
});

describe('SidebarTree collapse', () => {
  it('should call toggleCollapse and hide children when a folder row is clicked (AC-010)', async () => {
    const { gateway } = renderTree([folder('f', [ruleNode('child')])]);
    const row = await screen.findByLabelText('Folder: f');
    expect(screen.getByRole('button', { name: 'Edit: child' })).toBeInTheDocument();

    fireEvent.click(row);

    await waitFor(() => expect(gateway.toggleCollapse).toHaveBeenCalledWith('f'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit: child' })).not.toBeInTheDocument());
  });

  it('should hide the children of a folder that starts collapsed (AC-010)', async () => {
    renderTree([folder('f', [ruleNode('child')], true)]);
    await screen.findByLabelText('Folder: f');
    expect(screen.queryByRole('button', { name: 'Edit: child' })).not.toBeInTheDocument();
  });
});

describe('SidebarTree rule row actions', () => {
  it('should toggle a rule enabled state via its switch', async () => {
    const { gateway } = renderTree([ruleNode('r1')]);
    const toggle = await screen.findByRole('switch', { name: 'Enabled: r1' });

    fireEvent.click(toggle);

    await waitFor(() => expect(gateway.updateRule).toHaveBeenCalledTimes(1));
    const [updated] = gateway.updateRule.mock.calls[0] as [Rule];
    expect(updated.enabled).toBe(false);
  });

  it('should call onEdit when a rule name is clicked', async () => {
    const onEdit = vi.fn();
    renderTree([ruleNode('r1')], onEdit);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit: r1' }));

    expect(onEdit).toHaveBeenCalledWith('r1');
  });

  it('should duplicate a rule from its context menu', async () => {
    const { gateway } = renderTree([ruleNode('r1')]);
    const row = (await screen.findByRole('button', { name: 'Edit: r1' })).closest('[role="treeitem"]') as HTMLElement;

    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: /duplicate/i }));

    await waitFor(() => expect(gateway.duplicateRule).toHaveBeenCalledTimes(1));
  });

  it('should make rule and folder rows draggable', async () => {
    renderTree([folder('f'), ruleNode('r1')]);
    const ruleRow = (await screen.findByRole('button', { name: 'Edit: r1' })).closest('[role="treeitem"]');
    const folderRow = screen.getByLabelText('Folder: f');
    expect(ruleRow).toHaveAttribute('aria-roledescription', 'draggable');
    expect(folderRow).toHaveAttribute('aria-roledescription', 'draggable');
  });
});

const rowFor = (name: string): HTMLElement =>
  screen.getByRole('button', { name: `Edit: ${name}` }).closest('[role="treeitem"]') as HTMLElement;

const ROW_H = 40;

// dnd-kit measures every droppable's rect at drag start via getBoundingClientRect,
// so all rows must be stubbed BEFORE the drag or pointerWithin finds no target.
const stubRects = (order: HTMLElement[]) =>
  order.forEach((el, index) => {
    const top = index * ROW_H;
    el.getBoundingClientRect = () =>
      ({ top, height: ROW_H, bottom: top + ROW_H, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  });

// Drive @dnd-kit's PointerSensor: press on the source, move past the 5px
// activation threshold, hover the target (row + document), then release.
const dragTo = (source: HTMLElement, sourceTop: number, target: HTMLElement, dropY: number) => {
  fireEvent.pointerDown(source, { pointerId: 1, button: 0, isPrimary: true, clientX: 10, clientY: sourceTop + 10 });
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: sourceTop + 20 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 10, clientY: dropY });
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: dropY });
  fireEvent.pointerUp(document, { pointerId: 1, clientX: 10, clientY: dropY });
};

describe('SidebarTree drag-and-drop', () => {
  it('should call moveNode when a rule is dropped before another (AC-002)', async () => {
    const { gateway } = renderTree([ruleNode('r1'), ruleNode('r2'), ruleNode('r3')]);
    await screen.findByRole('button', { name: 'Edit: r1' });
    stubRects([rowFor('r1'), rowFor('r2'), rowFor('r3')]);

    dragTo(rowFor('r3'), 80, rowFor('r1'), 4);

    await waitFor(() => expect(gateway.moveNode).toHaveBeenCalledTimes(1));
    const [dragId, target] = gateway.moveNode.mock.calls[0] as [string, { parentId: string | null; index: number }];
    expect(dragId).toBe('r3');
    expect(target).toEqual({ parentId: null, index: 0 });
  });

  it('should call moveNode with the folder as parent when a rule is dropped inside a folder (AC-003)', async () => {
    const { gateway } = renderTree([folder('f'), ruleNode('r2')]);
    await screen.findByRole('button', { name: 'Edit: r2' });
    const folderRow = screen.getByLabelText('Folder: f');
    stubRects([folderRow, rowFor('r2')]);

    dragTo(rowFor('r2'), 40, folderRow, 20);

    await waitFor(() => expect(gateway.moveNode).toHaveBeenCalledTimes(1));
    const [dragId, target] = gateway.moveNode.mock.calls[0] as [string, { parentId: string | null; index: number }];
    expect(dragId).toBe('r2');
    expect(target.parentId).toBe('f');
  });

  it('should render an empty-folder drop zone while a drag is active (TC-003)', async () => {
    renderTree([folder('empty'), ruleNode('r1')]);
    await screen.findByRole('button', { name: 'Edit: r1' });
    const folderRow = screen.getByLabelText('Folder: empty');
    stubRects([folderRow, rowFor('r1')]);

    fireEvent.pointerDown(rowFor('r1'), { pointerId: 1, button: 0, isPrimary: true, clientX: 10, clientY: 50 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: 60 });

    expect(await screen.findByTestId('empty-drop-zone')).toBeInTheDocument();
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 10, clientY: 60 });
  });
});

describe('SidebarTree search filter', () => {
  it('should render a flat filtered list with no folders or drag handles while filtering', async () => {
    renderTree([folder('mine', [ruleNode('alpha'), ruleNode('beta')])], vi.fn(), 'alpha');

    expect(await screen.findByRole('button', { name: 'Edit: alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit: beta' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Folder: mine')).not.toBeInTheDocument();
    const row = screen.getByRole('button', { name: 'Edit: alpha' }).closest('li') as HTMLElement;
    expect(within(row).queryByRole('treeitem')).not.toBeInTheDocument();
  });

  it('should show a no-match hint if nothing matches the filter', async () => {
    renderTree([ruleNode('alpha')], vi.fn(), 'zzz');
    expect(await screen.findByText(/no rules match/i)).toBeInTheDocument();
  });
});
