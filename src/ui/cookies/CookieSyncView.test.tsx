// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    <ToastProvider>
      <CookieSyncView gateway={gateway} />
    </ToastProvider>,
  );

describe('CookieSyncView', () => {
  it('should render an existing mapping loaded from the gateway (TC-011)', async () => {
    renderView(createFakeGateway([mapping()]));
    expect(await screen.findByDisplayValue('prod -> local')).toBeInTheDocument();
  });

  it('should show an empty-state prompt when there are no mappings (TC-011)', async () => {
    renderView(createFakeGateway([]));
    expect(await screen.findByText(/no cookie mappings/i)).toBeInTheDocument();
  });

  it('should add a new mapping and persist it via the gateway (TC-011)', async () => {
    const gateway = createFakeGateway([]);
    renderView(gateway);
    fireEvent.click(await screen.findByRole('button', { name: /add mapping/i }));
    await waitFor(() => expect(gateway.saved.at(-1)?.mappings.length).toBe(1));
  });

  it('should delete a mapping and persist the removal (TC-011)', async () => {
    const gateway = createFakeGateway([mapping()]);
    renderView(gateway);
    fireEvent.click(await screen.findByRole('button', { name: /delete mapping/i }));
    await waitFor(() => expect(gateway.saved.at(-1)?.mappings).toEqual([]));
  });

  it('should persist an edit to the target url (TC-014)', async () => {
    const gateway = createFakeGateway([mapping()]);
    renderView(gateway);
    const input = await screen.findByLabelText(/target url/i);
    fireEvent.change(input, { target: { value: 'http://localhost:4000' } });
    await waitFor(() =>
      expect(gateway.saved.at(-1)?.mappings[0].targetUrl).toBe('http://localhost:4000'),
    );
  });

  it('should parse comma separated cookie names into a trimmed array (TC-011)', async () => {
    const gateway = createFakeGateway([mapping({ cookieNames: [] })]);
    renderView(gateway);
    const input = await screen.findByLabelText(/cookie names/i);
    fireEvent.change(input, { target: { value: 'auth,  sid , refresh' } });
    await waitFor(() =>
      expect(gateway.saved.at(-1)?.mappings[0].cookieNames).toEqual(['auth', 'sid', 'refresh']),
    );
  });

  it('should call sync and show a copied-count toast on Sync now (TC-013)', async () => {
    const gateway = createFakeGateway([mapping()], { copied: ['auth', 'sid'], skipped: [] });
    renderView(gateway);
    fireEvent.click(await screen.findByRole('button', { name: /sync now/i }));
    await waitFor(() => expect(gateway.sync).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/copied 2 cookie/i)).toBeInTheDocument();
  });

  it('should report skipped names in the toast (TC-013)', async () => {
    const gateway = createFakeGateway([mapping()], {
      copied: ['auth'],
      skipped: [{ name: 'sid', reason: 'not-found' }],
    });
    renderView(gateway);
    fireEvent.click(await screen.findByRole('button', { name: /sync now/i }));
    expect(await screen.findByText(/skipped 1/i)).toBeInTheDocument();
  });

  it('should disable Sync now when source or target url is empty (edge)', async () => {
    renderView(createFakeGateway([mapping({ targetUrl: '' })]));
    expect(await screen.findByRole('button', { name: /sync now/i })).toBeDisabled();
  });

  it('should report a copied count of zero when the allow-list is empty (TC-010 UI)', async () => {
    const gateway = createFakeGateway([mapping({ cookieNames: [] })], { copied: [], skipped: [] });
    renderView(gateway);
    fireEvent.click(await screen.findByRole('button', { name: /sync now/i }));
    expect(await screen.findByText(/copied 0 cookie/i)).toBeInTheDocument();
  });
});
