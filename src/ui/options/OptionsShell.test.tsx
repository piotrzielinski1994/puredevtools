// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RulesProvider } from '../shared/RulesProvider';
import { ToastProvider } from '../components/ui/toast';
import { createFakeGateway } from '../shared/test-gateway';
import type { CookieGateway } from '../cookies/cookieGateway';
import { OptionsShell } from './OptionsShell';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    cookies: { getAll: vi.fn(async () => []), set: vi.fn(async () => null) },
  },
}));

const cookieGateway = (): CookieGateway => ({
  getAll: async () => ({ mappings: [] }),
  save: async () => undefined,
  sync: async () => ({ copied: [], skipped: [] }),
});

const renderShell = () =>
  render(
    <RulesProvider gateway={createFakeGateway()}>
      <ToastProvider>
        <OptionsShell cookieGateway={cookieGateway()} />
      </ToastProvider>
    </RulesProvider>,
  );

describe('OptionsShell', () => {
  it('should show the rules workspace by default (TC-012)', async () => {
    renderShell();
    expect(await screen.findByRole('button', { name: /new rule/i })).toBeInTheDocument();
    expect(screen.queryByText(/no cookie mappings/i)).not.toBeInTheDocument();
  });

  it('should switch to the cookie sync view when the Cookie sync tab is clicked (TC-012)', async () => {
    renderShell();
    fireEvent.click(await screen.findByRole('button', { name: /cookie sync/i }));
    await waitFor(() => expect(screen.getByText(/no cookie mappings/i)).toBeInTheDocument());
  });

  it('should switch back to the rules workspace from the cookie sync view (TC-012)', async () => {
    renderShell();
    fireEvent.click(await screen.findByRole('button', { name: /cookie sync/i }));
    await screen.findByText(/no cookie mappings/i);
    fireEvent.click(screen.getByRole('button', { name: /^rules$/i }));
    await waitFor(() => expect(screen.queryByText(/no cookie mappings/i)).not.toBeInTheDocument());
  });
});
