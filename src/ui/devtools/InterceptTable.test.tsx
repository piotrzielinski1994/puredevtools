// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { PanelEntry } from '../../devtools/types';
import { InterceptTable } from './InterceptTable';

const buildEntry = (overrides: Partial<PanelEntry> = {}): PanelEntry => ({
  id: 1,
  kind: 'mock',
  method: 'GET',
  url: 'https://api.x/users',
  status: 201,
  body: '{"a":1}',
  contentType: 'application/json',
  ...overrides,
});

const threeEntries = (): PanelEntry[] => [
  buildEntry({ id: 1, kind: 'mock', method: 'GET', url: 'https://api.x/users', status: 201, body: '{"a":1}' }),
  buildEntry({ id: 2, kind: 'rewrite', method: 'POST', url: 'https://api.x/orders', status: 200, body: 'plain text' }),
  buildEntry({ id: 3, kind: 'mock', method: 'DELETE', url: 'https://cdn.y/asset.js', status: 404, body: '{"b":2}' }),
];

const dataRows = (): HTMLElement[] =>
  screen.getAllByRole('row').filter((row) => within(row).queryAllByRole('columnheader').length === 0);

describe('InterceptTable', () => {
  it('should render one data row per entry showing kind, method, url and status (TC-007)', () => {
    const entries = threeEntries();
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);

    const rows = dataRows();
    expect(rows).toHaveLength(3);

    entries.forEach((entry, index) => {
      const row = within(rows[index]);
      expect(row.getByText(entry.url)).toBeInTheDocument();
      expect(row.getByText(entry.method)).toBeInTheDocument();
      expect(row.getByText(new RegExp(String(entry.status)))).toBeInTheDocument();
      expect(row.getByText(new RegExp(entry.kind, 'i'))).toBeInTheDocument();
    });
  });

  it('should show an empty-state message and no data rows when there are no entries (TC-008)', () => {
    render(<InterceptTable entries={[]} onClear={vi.fn()} />);

    expect(screen.getByText(/no intercepted requests/i)).toBeInTheDocument();
    expect(dataRows()).toHaveLength(0);
  });

  it('should reveal a detail region with the pretty-printed JSON body when a row is clicked (TC-009)', () => {
    const entries = threeEntries();
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);

    const rows = dataRows();
    fireEvent.click(within(rows[0]).getByText('https://api.x/users'));

    expect(screen.getByText(/"a"/)).toBeInTheDocument();
  });

  it('should filter rows by url substring case-insensitively and restore them when cleared (TC-010)', () => {
    const entries = threeEntries();
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);

    const filter = screen.getByRole('textbox');
    fireEvent.change(filter, { target: { value: 'orders' } });

    expect(screen.getByText('https://api.x/orders')).toBeInTheDocument();
    expect(screen.queryByText('https://api.x/users')).not.toBeInTheDocument();
    expect(screen.queryByText('https://cdn.y/asset.js')).not.toBeInTheDocument();

    fireEvent.change(filter, { target: { value: '' } });

    expect(screen.getByText('https://api.x/users')).toBeInTheDocument();
    expect(screen.getByText('https://api.x/orders')).toBeInTheDocument();
    expect(screen.getByText('https://cdn.y/asset.js')).toBeInTheDocument();
  });

  it('should call onClear when the Clear button is clicked (TC-011)', () => {
    const onClear = vi.fn();
    render(<InterceptTable entries={threeEntries()} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('should show a filter-empty hint when entries exist but none match the filter', () => {
    render(<InterceptTable entries={threeEntries()} onClear={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'no-such-url' } });

    expect(screen.getByText(/match the filter/i)).toBeInTheDocument();
    expect(dataRows()).toHaveLength(0);
  });

  it('should show a non-JSON body verbatim in the detail without throwing', () => {
    const entries = [buildEntry({ id: 1, url: 'https://api.x/plain', body: 'not json at all', contentType: 'text/plain' })];
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);

    fireEvent.click(within(dataRows()[0]).getByText('https://api.x/plain'));

    expect(screen.getByText('not json at all')).toBeInTheDocument();
    expect(screen.getByText('text/plain')).toBeInTheDocument();
  });
});
