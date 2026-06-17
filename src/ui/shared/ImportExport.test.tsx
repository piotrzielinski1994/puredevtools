import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Capabilities } from '../../engine/RequestEngine';
import type { Rule } from '../../rules/model';
import type { ImportOutcome, UiGateway } from './gateway';
import { RulesProvider } from './RulesProvider';
import { ImportExport } from './ImportExport';

type FakeGateway = UiGateway & {
  getAll: ReturnType<typeof vi.fn>;
  getGlobalEnabled: ReturnType<typeof vi.fn>;
  getCapabilities: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reorder: ReturnType<typeof vi.fn>;
  setGlobalEnabled: ReturnType<typeof vi.fn>;
  exportToFile: ReturnType<typeof vi.fn>;
  importFromFile: ReturnType<typeof vi.fn>;
};

const createFakeGateway = (
  importOutcome: ImportOutcome = { ok: true },
): FakeGateway => ({
  getAll: vi.fn<() => Promise<Rule[]>>().mockResolvedValue([]),
  getGlobalEnabled: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  getCapabilities: vi
    .fn<() => Promise<Capabilities>>()
    .mockResolvedValue({ responseBodyRewrite: true, artificialLatency: true }),
  add: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  update: vi.fn<(rule: Rule) => Promise<void>>().mockResolvedValue(undefined),
  remove: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  reorder: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  setGlobalEnabled: vi.fn<(enabled: boolean) => Promise<void>>().mockResolvedValue(undefined),
  exportToFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  importFromFile: vi.fn<(json: string) => Promise<ImportOutcome>>().mockResolvedValue(importOutcome),
});

const renderImportExport = (gateway: UiGateway) =>
  render(
    <RulesProvider gateway={gateway}>
      <ImportExport />
    </RulesProvider>,
  );

const makeJsonFile = (json: string): File => {
  const file = new File([json], 'rules.json', { type: 'application/json' });
  vi.spyOn(file, 'text').mockResolvedValue(json);
  return file;
};

describe('ImportExport', () => {
  it('should call gateway.exportToFile once when Export is clicked (AC-007 export)', async () => {
    const gateway = createFakeGateway();
    renderImportExport(gateway);

    const exportButton = await screen.findByRole('button', { name: /export/i });
    fireEvent.click(exportButton);

    await waitFor(() => expect(gateway.exportToFile).toHaveBeenCalledTimes(1));
  });

  it('should call gateway.importFromFile with the chosen file text on valid import (AC-007 import)', async () => {
    const gateway = createFakeGateway({ ok: true });
    renderImportExport(gateway);

    await screen.findByTestId('import-input');
    const input = screen.getByTestId('import-input');
    const json = '{"version":1,"rules":[]}';
    const file = makeJsonFile(json);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(gateway.importFromFile).toHaveBeenCalledTimes(1));
    expect(gateway.importFromFile).toHaveBeenCalledWith(json);
  });

  it('should render an error message when import resolves ok:false (AC-007 import invalid)', async () => {
    const gateway = createFakeGateway({ ok: false, error: 'bad' });
    renderImportExport(gateway);

    await screen.findByTestId('import-input');
    const input = screen.getByTestId('import-input');
    const file = makeJsonFile('{"not":"valid"}');

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/bad/i)).toBeInTheDocument();
  });
});
