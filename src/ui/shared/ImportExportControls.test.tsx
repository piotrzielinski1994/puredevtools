// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Rule } from '../../rules/model';
import { RulesProvider } from './RulesProvider';
import { ToastProvider } from '../components/ui/toast';
import { ImportExportControls } from './ImportExportControls';
import { createFakeGateway, ruleNodes, type FakeGateway } from './test-gateway';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}),
        set: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn<() => void>(),
        removeListener: vi.fn<() => void>(),
      },
    },
  },
}));

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'rule one',
  enabled: true,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'rewriteBody', body: 'x' }],
  ...overrides,
});

const createGatewayWith = (rules: Rule[]): FakeGateway => createFakeGateway(ruleNodes(rules));

const renderControls = (gateway: FakeGateway) =>
  render(
    <RulesProvider gateway={gateway}>
      <ToastProvider>
        <ImportExportControls />
      </ToastProvider>
    </RulesProvider>,
  );

// selector contract for the implementer:
//   Export control  -> aria-label="Export rules"
//   Import control  -> aria-label="Import rules"
//   hidden file input -> data-testid="import-file-input"
const exportButton = () => screen.getByLabelText('Export rules');
const importButton = () => screen.getByLabelText('Import rules');
const importFileInput = () => screen.getByTestId('import-file-input') as HTMLInputElement;

const VALID_JSON = '{"version":1,"tree":[]}';

const jsonFile = (contents: string): File =>
  new File([contents], 'rules.json', { type: 'application/json' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ImportExportControls', () => {
  it('should call exportToFile once if the Export control is clicked (AC-001, TC-001)', async () => {
    // side-effect-contract: Export click delegates to gateway.exportToFile via exportRules
    const gateway = createGatewayWith([buildRule()]);
    renderControls(gateway);

    await screen.findByLabelText('Export rules');
    fireEvent.click(exportButton());

    await waitFor(() => expect(gateway.exportToFile).toHaveBeenCalledTimes(1));
  });

  it('should render a hidden file input that accepts JSON for Import (AC-002)', async () => {
    // behavior: an Import control plus a JSON-accepting file input are present
    const gateway = createGatewayWith([buildRule()]);
    renderControls(gateway);

    expect(await screen.findByLabelText('Import rules')).toBeInTheDocument();
    const input = importFileInput();
    expect(input.type).toBe('file');
    expect(input.accept).toMatch(/json/i);
  });

  it('should open the file picker if the Import control is clicked (AC-002)', async () => {
    // behavior: the Import button triggers a click on the hidden file input
    const gateway = createGatewayWith([buildRule()]);
    renderControls(gateway);

    await screen.findByLabelText('Import rules');
    const clickSpy = vi.spyOn(importFileInput(), 'click');
    fireEvent.click(importButton());

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('should do nothing if a change fires with no selected file (edge)', async () => {
    // behavior: an empty file selection is a no-op - no confirm, no import
    const gateway = createGatewayWith([buildRule()]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderControls(gateway);

    await screen.findByLabelText('Import rules');
    fireEvent.change(importFileInput(), { target: { files: [] } });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(gateway.importFromFile).not.toHaveBeenCalled();
  });

  it('should call importFromFile with the file text and replace and show a success toast if confirmed (AC-003, TC-002)', async () => {
    // side-effect-contract: confirmed valid import delegates to importFromFile(json, 'replace')
    const gateway = createGatewayWith([buildRule()]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderControls(gateway);

    await screen.findByLabelText('Import rules');
    fireEvent.change(importFileInput(), { target: { files: [jsonFile(VALID_JSON)] } });

    await waitFor(() => expect(gateway.importFromFile).toHaveBeenCalledTimes(1));
    expect(gateway.importFromFile).toHaveBeenCalledWith(VALID_JSON, 'replace');
    expect(await screen.findByText('Rules imported.')).toBeInTheDocument();
  });

  it('should not call importFromFile and show no success toast if the confirm is cancelled (AC-004, TC-003)', async () => {
    // behavior: cancelling the replace confirm aborts the import
    const gateway = createGatewayWith([buildRule()]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderControls(gateway);

    await screen.findByLabelText('Import rules');
    fireEvent.change(importFileInput(), { target: { files: [jsonFile(VALID_JSON)] } });

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(gateway.importFromFile).not.toHaveBeenCalled();
    expect(screen.queryByText('Rules imported.')).not.toBeInTheDocument();
  });

  it('should show an error toast with the message and leave rules unchanged if the import outcome is not ok (AC-005, TC-004)', async () => {
    // behavior: a failed import surfaces the error message and does not refresh the rules
    const gateway = createGatewayWith([buildRule()]);
    gateway.importFromFile.mockResolvedValue({ ok: false, error: 'boom' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderControls(gateway);

    await screen.findByLabelText('Import rules');
    const workspaceCallsBefore = gateway.getWorkspace.mock.calls.length;
    fireEvent.change(importFileInput(), { target: { files: [jsonFile('not-json')] } });

    expect(await screen.findByText(/boom/)).toBeInTheDocument();
    expect(gateway.getWorkspace.mock.calls.length).toBe(workspaceCallsBefore);
  });

  it('should show an error toast if the file cannot be read (edge)', async () => {
    // behavior: a File.text() rejection surfaces an error toast instead of an unhandled rejection
    const gateway = createGatewayWith([buildRule()]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderControls(gateway);

    await screen.findByLabelText('Import rules');
    const file = jsonFile(VALID_JSON);
    Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('read boom')) });
    fireEvent.change(importFileInput(), { target: { files: [file] } });

    expect(await screen.findByText(/read boom/)).toBeInTheDocument();
    expect(gateway.importFromFile).not.toHaveBeenCalled();
  });

  it('should reset the file input value so the same file re-fires the change handler after a cancel (AC-006, TC-005)', async () => {
    // behavior: the input value is cleared so re-picking the same file triggers onChange again
    const gateway = createGatewayWith([buildRule()]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderControls(gateway);

    await screen.findByLabelText('Import rules');
    const input = importFileInput();

    fireEvent.change(input, { target: { files: [jsonFile(VALID_JSON)] } });
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('');

    fireEvent.change(input, { target: { files: [jsonFile(VALID_JSON)] } });
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(2));
  });
});
