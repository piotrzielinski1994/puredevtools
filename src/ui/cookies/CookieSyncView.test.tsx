// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import type { CookieMapping, CookieSyncState, CookieTreeNode, SyncResult } from '../../cookies/model';
import { flatten } from '../../cookies/tree';
import { ToastProvider } from '../components/ui/toast';
import { CookieSyncView } from './CookieSyncView';
import type { CookieGateway } from './cookieGateway';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    cookies: { getAll: vi.fn(async () => []), set: vi.fn(async () => null) },
  },
}));

const mapping = (over: Partial<CookieMapping> = {}): CookieMapping => ({
  id: 'cm1',
  name: 'prod -> local',
  enabled: true,
  sourceUrl: 'https://app.prod.com',
  targetUrl: 'http://localhost:3000',
  cookieNames: ['auth'],
  ...over,
});

const createFakeGateway = (
  initial: CookieMapping[] = [],
  syncResult: SyncResult = { copied: ['auth'], skipped: [] },
): CookieGateway & { saved: CookieSyncState[]; sync: ReturnType<typeof vi.fn> } => {
  const saved: CookieSyncState[] = [];
  return {
    saved,
    getAll: async () => ({ tree: initial.map((mapping) => ({ kind: 'mapping', mapping })) }),
    save: async (state) => {
      saved.push(state);
    },
    sync: vi.fn(async () => syncResult),
  };
};

const savedMappings = (state: CookieSyncState | undefined): CookieMapping[] => (state ? flatten(state.tree) : []);

const renderView = (gateway: CookieGateway) =>
  render(
    <HotkeysProvider>
      <ToastProvider>
        <CookieSyncView gateway={gateway} />
      </ToastProvider>
    </HotkeysProvider>,
  );

const detail = () => screen.getByRole('region', { name: /mapping editor/i });
const sidebar = () => screen.getByRole('navigation', { name: /cookie mappings/i });

describe('CookieSyncView', () => {
  it('should auto-select and render the first mapping loaded from the gateway (TC-011)', async () => {
    renderView(createFakeGateway([mapping()]));
    expect(await screen.findByDisplayValue('prod -> local')).toBeInTheDocument();
  });

  it('should list every mapping as a selectable sidebar row (TC-011)', async () => {
    renderView(createFakeGateway([mapping(), mapping({ id: 'cm2', name: 'staging -> local' })]));
    const nav = await screen.findByRole('navigation', { name: /cookie mappings/i });
    expect(within(nav).getByRole('button', { name: /prod -> local/i })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /staging -> local/i })).toBeInTheDocument();
  });

  it('should show the source and target url as the sidebar row subtitle (TC-011)', async () => {
    renderView(createFakeGateway([mapping()]));
    const nav = await screen.findByRole('navigation', { name: /cookie mappings/i });
    expect(within(nav).getByText(/app\.prod\.com.*localhost:3000/i)).toBeInTheDocument();
  });

  it('should show the selected mapping name and its actions in the content top bar (TC-011)', async () => {
    renderView(createFakeGateway([mapping()]));
    const region = detail();
    expect(await within(region).findByText('prod -> local')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: /sync now/i })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: /delete mapping/i })).toBeInTheDocument();
  });

  it('should add a mapping from the content tab bar, not the sidebar (TC-011)', async () => {
    const gateway = createFakeGateway([]);
    renderView(gateway);
    const region = detail();
    fireEvent.click(await within(region).findByRole('button', { name: /add mapping/i }));
    await waitFor(() => expect(savedMappings(gateway.saved.at(-1)).length).toBe(1));
    expect(within(sidebar()).queryByRole('button', { name: /add mapping/i })).not.toBeInTheDocument();
  });

  it('should switch the detail form when another sidebar row is selected (TC-011)', async () => {
    renderView(createFakeGateway([mapping(), mapping({ id: 'cm2', name: 'staging -> local' })]));
    const nav = await screen.findByRole('navigation', { name: /cookie mappings/i });
    fireEvent.click(within(nav).getByRole('button', { name: /staging -> local/i }));
    await waitFor(() => expect(within(detail()).getByLabelText(/mapping name/i)).toHaveValue('staging -> local'));
  });

  it('should show an empty-state prompt when there are no mappings (TC-011)', async () => {
    renderView(createFakeGateway([]));
    expect(await screen.findByText(/no cookie mappings/i)).toBeInTheDocument();
  });

  it('should add a new mapping, persist it, and select it (TC-011)', async () => {
    const gateway = createFakeGateway([]);
    renderView(gateway);
    fireEvent.click(await screen.findByRole('button', { name: /add mapping/i }));
    await waitFor(() => expect(savedMappings(gateway.saved.at(-1)).length).toBe(1));
    expect(within(detail()).getByLabelText(/mapping name/i)).toBeInTheDocument();
  });

  it('should add a new mapping from the empty-area sidebar context menu', async () => {
    const gateway = createFakeGateway([]);
    renderView(gateway);
    await screen.findByText(/no cookie mappings/i);

    fireEvent.contextMenu(screen.getByTestId('sidebar-background'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /new mapping/i }));

    await waitFor(() => expect(savedMappings(gateway.saved.at(-1)).length).toBe(1));
  });

  it('should not let the sidebar contextmenu event reach window so the menu does not self-dismiss', async () => {
    renderView(createFakeGateway([mapping()]));
    await screen.findByDisplayValue('prod -> local');
    const windowListener = vi.fn();
    window.addEventListener('contextmenu', windowListener);

    fireEvent.contextMenu(screen.getByTestId('sidebar-background'));

    window.removeEventListener('contextmenu', windowListener);
    expect(windowListener).not.toHaveBeenCalled();
    expect(await screen.findByRole('menuitem', { name: /new mapping/i })).toBeInTheDocument();
  });

  it('should delete the selected mapping and persist the removal (TC-011)', async () => {
    const gateway = createFakeGateway([mapping()]);
    renderView(gateway);
    fireEvent.click(await within(detail()).findByRole('button', { name: /delete mapping/i }));
    await waitFor(() => expect(savedMappings(gateway.saved.at(-1))).toEqual([]));
  });

  it('should persist an edit to the target url (TC-014)', async () => {
    const gateway = createFakeGateway([mapping()]);
    renderView(gateway);
    const input = await within(detail()).findByLabelText(/target url/i);
    fireEvent.change(input, { target: { value: 'http://localhost:4000' } });
    await waitFor(() => expect(savedMappings(gateway.saved.at(-1))[0].targetUrl).toBe('http://localhost:4000'));
  });

  it('should reflect a name edit in the sidebar row label (TC-011)', async () => {
    const gateway = createFakeGateway([mapping()]);
    renderView(gateway);
    const input = await within(detail()).findByLabelText(/mapping name/i);
    fireEvent.change(input, { target: { value: 'renamed' } });
    await waitFor(() =>
      expect(within(sidebar()).getByRole('button', { name: /renamed/i })).toBeInTheDocument(),
    );
  });

  it('should parse comma separated cookie names into a trimmed array (TC-011)', async () => {
    const gateway = createFakeGateway([mapping({ cookieNames: [] })]);
    renderView(gateway);
    const input = await within(detail()).findByLabelText(/cookie names/i);
    fireEvent.change(input, { target: { value: 'auth,  sid , refresh' } });
    await waitFor(() =>
      expect(savedMappings(gateway.saved.at(-1))[0].cookieNames).toEqual(['auth', 'sid', 'refresh']),
    );
  });

  it('should call sync and show a copied-count toast on Sync now (TC-013)', async () => {
    const gateway = createFakeGateway([mapping()], { copied: ['auth', 'sid'], skipped: [] });
    renderView(gateway);
    fireEvent.click(await within(detail()).findByRole('button', { name: /sync now/i }));
    await waitFor(() => expect(gateway.sync).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/copied 2 cookie/i)).toBeInTheDocument();
  });

  it('should report each skipped cookie name and reason in the toast (TC-013)', async () => {
    const gateway = createFakeGateway([mapping()], {
      copied: ['auth'],
      skipped: [
        { name: 'sid', reason: 'not-found' },
        { name: '__Host-csrf', reason: 'set-rejected' },
      ],
    });
    renderView(gateway);
    fireEvent.click(await within(detail()).findByRole('button', { name: /sync now/i }));
    expect(
      await screen.findByText(/skipped 2: sid \(not found on source\), __Host-csrf \(rejected by browser\)/i),
    ).toBeInTheDocument();
  });

  it('should sync the selected mapping on Mod+Enter and toast the real result (TC-015)', async () => {
    const gateway = createFakeGateway([mapping()], { copied: ['auth', 'sid'], skipped: [] });
    renderView(gateway);
    await within(detail()).findByLabelText(/mapping name/i);
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(gateway.sync).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/copied 2 cookie/i)).toBeInTheDocument();
  });

  it('should not show a fake Saved toast on Mod+S (TC-015)', async () => {
    renderView(createFakeGateway([mapping()]));
    await within(detail()).findByLabelText(/mapping name/i);
    await userEvent.keyboard('{Control>}s{/Control}');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText(/^saved$/i)).not.toBeInTheDocument();
  });

  it('should disable Sync now when source or target url is empty (edge)', async () => {
    renderView(createFakeGateway([mapping({ targetUrl: '' })]));
    expect(await within(detail()).findByRole('button', { name: /sync now/i })).toBeDisabled();
  });

  it('should report a copied count of zero when the allow-list is empty (TC-010 UI)', async () => {
    const gateway = createFakeGateway([mapping({ cookieNames: [] })], { copied: [], skipped: [] });
    renderView(gateway);
    fireEvent.click(await within(detail()).findByRole('button', { name: /sync now/i }));
    expect(await screen.findByText(/copied 0 cookie/i)).toBeInTheDocument();
  });
});

const createTreeGateway = (
  tree: CookieTreeNode[],
): CookieGateway & { saved: CookieSyncState[]; sync: ReturnType<typeof vi.fn> } => {
  const saved: CookieSyncState[] = [];
  return {
    saved,
    getAll: async () => ({ tree }),
    save: async (state) => {
      saved.push(state);
    },
    sync: vi.fn(async () => ({ copied: [], skipped: [] })),
  };
};

const mappingNode = (over: Partial<CookieMapping> = {}): CookieTreeNode => ({ kind: 'mapping', mapping: mapping(over) });
const cookieFolder = (id: string, children: CookieTreeNode[] = [], collapsed = false): CookieTreeNode => ({
  kind: 'folder',
  id,
  name: id,
  collapsed,
  children,
});

describe('CookieSyncView folders', () => {
  it('should render a nested folder/mapping tree to arbitrary depth (TC-005)', async () => {
    renderView(createTreeGateway([cookieFolder('env', [cookieFolder('prod', [mappingNode({ id: 'cm1', name: 'auth' })])])]));
    expect(await screen.findByLabelText('Folder: env')).toBeInTheDocument();
    expect(screen.getByLabelText('Folder: prod')).toBeInTheDocument();
    expect(screen.getByLabelText('Mapping: auth')).toBeInTheDocument();
  });

  it('should offer New folder / Rename / Duplicate / Delete on a folder context menu (TC-006)', async () => {
    renderView(createTreeGateway([cookieFolder('env')]));
    fireEvent.contextMenu(await screen.findByLabelText('Folder: env'));
    expect(await screen.findByRole('menuitem', { name: /new folder/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /rename/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /duplicate/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  it('should offer Edit / Duplicate / Delete on a mapping context menu (TC-007)', async () => {
    const gateway = createTreeGateway([mappingNode({ id: 'cm1', name: 'auth' })]);
    renderView(gateway);
    fireEvent.contextMenu(await screen.findByLabelText('Mapping: auth'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /duplicate/i }));
    await waitFor(() => expect(savedMappings(gateway.saved.at(-1))).toHaveLength(2));
  });

  it('should add a folder from the empty-area context menu (TC-008)', async () => {
    const gateway = createTreeGateway([mappingNode({ id: 'cm1' })]);
    renderView(gateway);
    await screen.findByLabelText('Mapping: prod -> local');
    fireEvent.contextMenu(screen.getByTestId('sidebar-background'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /new folder/i }));
    await waitFor(() => expect(gateway.saved.at(-1)?.tree.some((node) => node.kind === 'folder')).toBe(true));
  });

  it('should delete a folder and its whole subtree after a confirm (TC-011)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const gateway = createTreeGateway([cookieFolder('env', [mappingNode({ id: 'cm1' })])]);
    renderView(gateway);
    fireEvent.contextMenu(await screen.findByLabelText('Folder: env'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /delete/i }));
    await waitFor(() => expect(gateway.saved.at(-1)?.tree).toEqual([]));
  });

  it('should duplicate a folder subtree with fresh mapping ids (TC-012)', async () => {
    const gateway = createTreeGateway([cookieFolder('env', [mappingNode({ id: 'cm1' })])]);
    renderView(gateway);
    fireEvent.contextMenu(await screen.findByLabelText('Folder: env'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /duplicate/i }));
    await waitFor(() => expect(savedMappings(gateway.saved.at(-1))).toHaveLength(2));
    const ids = savedMappings(gateway.saved.at(-1)).map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('should hide a collapsed folder children and persist the collapsed flag when toggled (TC-010)', async () => {
    const gateway = createTreeGateway([cookieFolder('env', [mappingNode({ id: 'cm1', name: 'auth' })], true)]);
    renderView(gateway);
    const folderRow = await screen.findByLabelText('Folder: env');
    expect(screen.queryByLabelText('Mapping: auth')).not.toBeInTheDocument();

    fireEvent.click(folderRow);

    await waitFor(() => expect(screen.getByLabelText('Mapping: auth')).toBeInTheDocument());
    const savedFolder = gateway.saved.at(-1)?.tree[0];
    expect(savedFolder && savedFolder.kind === 'folder' ? savedFolder.collapsed : null).toBe(false);
  });
});
