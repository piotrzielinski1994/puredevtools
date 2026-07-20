// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import type { CookieMapping, CookieSyncState, SyncResult } from '../../cookies/model';
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
    getAll: async () => ({ mappings: initial }),
    save: async (state) => {
      saved.push(state);
    },
    sync: vi.fn(async () => syncResult),
  };
};

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
    await waitFor(() => expect(gateway.saved.at(-1)?.mappings.length).toBe(1));
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
    await waitFor(() => expect(gateway.saved.at(-1)?.mappings.length).toBe(1));
    expect(within(detail()).getByLabelText(/mapping name/i)).toBeInTheDocument();
  });

  it('should delete the selected mapping and persist the removal (TC-011)', async () => {
    const gateway = createFakeGateway([mapping()]);
    renderView(gateway);
    fireEvent.click(await within(detail()).findByRole('button', { name: /delete mapping/i }));
    await waitFor(() => expect(gateway.saved.at(-1)?.mappings).toEqual([]));
  });

  it('should persist an edit to the target url (TC-014)', async () => {
    const gateway = createFakeGateway([mapping()]);
    renderView(gateway);
    const input = await within(detail()).findByLabelText(/target url/i);
    fireEvent.change(input, { target: { value: 'http://localhost:4000' } });
    await waitFor(() => expect(gateway.saved.at(-1)?.mappings[0].targetUrl).toBe('http://localhost:4000'));
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
      expect(gateway.saved.at(-1)?.mappings[0].cookieNames).toEqual(['auth', 'sid', 'refresh']),
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
