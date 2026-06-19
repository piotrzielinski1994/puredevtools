import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ApplyDiagnostics, Capabilities } from '../../engine/RequestEngine';
import type { Rule } from '../../rules/model';
import type { ImportOutcome, UiGateway } from './gateway';
import { RulesProvider } from './RulesProvider';
import { GlobalSwitch } from './GlobalSwitch';

type FakeGateway = UiGateway & {
  getAll: ReturnType<typeof vi.fn>;
  getGlobalEnabled: ReturnType<typeof vi.fn>;
  getCapabilities: ReturnType<typeof vi.fn>;
  getDiagnostics: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reorder: ReturnType<typeof vi.fn>;
  setGlobalEnabled: ReturnType<typeof vi.fn>;
  exportToFile: ReturnType<typeof vi.fn>;
  importFromFile: ReturnType<typeof vi.fn>;
};

const createFakeGateway = (globalEnabled: boolean): FakeGateway => ({
  getAll: vi.fn<() => Promise<Rule[]>>().mockResolvedValue([]),
  getGlobalEnabled: vi.fn<() => Promise<boolean>>().mockResolvedValue(globalEnabled),
  getCapabilities: vi
    .fn<() => Promise<Capabilities>>()
    .mockResolvedValue({ responseBodyRewrite: true, artificialLatency: true }),
  getDiagnostics: vi
    .fn<() => Promise<ApplyDiagnostics>>()
    .mockResolvedValue({ errors: [], unsupported: [] }),
  add: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  update: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  remove: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  reorder: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  setGlobalEnabled: vi.fn<(enabled: boolean) => Promise<void>>().mockResolvedValue(undefined),
  exportToFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  importFromFile: vi.fn<(json: string) => Promise<ImportOutcome>>().mockResolvedValue({ ok: true }),
});

const renderSwitch = (gateway: UiGateway) =>
  render(
    <RulesProvider gateway={gateway}>
      <GlobalSwitch />
    </RulesProvider>,
  );

describe('GlobalSwitch', () => {
  it('should reflect globalEnabled=true from context as a checked switch (AC-008)', async () => {
    const gateway = createFakeGateway(true);
    renderSwitch(gateway);

    const toggle = await screen.findByRole('switch');
    expect(toggle).toBeChecked();
  });

  it('should reflect globalEnabled=false from context as an unchecked switch (AC-008)', async () => {
    const gateway = createFakeGateway(false);
    renderSwitch(gateway);

    const toggle = await screen.findByRole('switch');
    expect(toggle).not.toBeChecked();
  });

  it('should call gateway.setGlobalEnabled with the new value when toggled (AC-008)', async () => {
    const gateway = createFakeGateway(true);
    renderSwitch(gateway);

    const toggle = await screen.findByRole('switch');
    fireEvent.click(toggle);

    await waitFor(() => expect(gateway.setGlobalEnabled).toHaveBeenCalledTimes(1));
    expect(gateway.setGlobalEnabled).toHaveBeenCalledWith(false);
  });
});
