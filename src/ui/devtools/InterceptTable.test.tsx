// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { PanelEntry } from '../../devtools/types';
import { InterceptTable, formatTime, toCurl } from './InterceptTable';

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

  it('should show request headers and request body sections in the detail when present', () => {
    const entries = [
      buildEntry({
        id: 1,
        url: 'https://api.x/post',
        method: 'POST',
        body: '{"resp":1}',
        requestHeaders: { authorization: 'Bearer abc' },
        requestBody: '{"req":2}',
      }),
    ];
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);

    fireEvent.click(within(dataRows()[0]).getByText('https://api.x/post'));

    expect(screen.getByText(/request headers/i)).toBeInTheDocument();
    expect(screen.getByText(/authorization: Bearer abc/)).toBeInTheDocument();
    expect(screen.getByText(/request body/i)).toBeInTheDocument();
    expect(screen.getByText(/"req"/)).toBeInTheDocument();
    expect(screen.getByText(/response body/i)).toBeInTheDocument();
  });

  it('should omit request sections when the entry has no request data', () => {
    const entries = [buildEntry({ id: 1, url: 'https://api.x/get' })];
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);

    fireEvent.click(within(dataRows()[0]).getByText('https://api.x/get'));

    expect(screen.queryByText(/request headers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/request body/i)).not.toBeInTheDocument();
    expect(screen.getByText(/response body/i)).toBeInTheDocument();
  });

  it('should render the formatted timestamp in the row', () => {
    const ts = new Date(2026, 0, 1, 13, 5, 9).getTime();
    const entries = [buildEntry({ id: 1, url: 'https://api.x/t', timestamp: ts })];
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);
    expect(within(dataRows()[0]).getByText('13:05:09')).toBeInTheDocument();
  });

  it('should copy the response body when Copy is clicked', () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    const entries = [buildEntry({ id: 1, url: 'https://api.x/c', body: '{"copied":1}' })];
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);

    fireEvent.click(within(dataRows()[0]).getByText('https://api.x/c'));
    fireEvent.click(screen.getByRole('button', { name: /copy response body/i }));

    expect(writeText).toHaveBeenCalledWith('{"copied":1}');
  });
});

describe('formatTime', () => {
  it('should format a timestamp as HH:MM:SS', () => {
    expect(formatTime(new Date(2026, 0, 1, 9, 7, 3).getTime())).toBe('09:07:03');
  });

  it('should return an empty string for an undefined timestamp', () => {
    expect(formatTime(undefined)).toBe('');
  });
});

describe('toCurl', () => {
  it('should build a plain GET without -X', () => {
    expect(toCurl(buildEntry({ method: 'GET', url: 'https://api.x/u', requestHeaders: undefined, requestBody: undefined }))).toBe(
      "curl 'https://api.x/u'",
    );
  });

  it('should include method, headers and body for a POST', () => {
    const curl = toCurl(
      buildEntry({
        method: 'POST',
        url: 'https://api.x/u',
        requestHeaders: { authorization: 'Bearer abc' },
        requestBody: '{"q":1}',
      }),
    );
    expect(curl).toContain('-X POST');
    expect(curl).toContain("-H 'authorization: Bearer abc'");
    expect(curl).toContain(`--data '{"q":1}'`);
    expect(curl).toContain("'https://api.x/u'");
  });

  it('should escape single quotes in values', () => {
    const curl = toCurl(buildEntry({ method: 'POST', url: 'https://api.x/u', requestBody: "it's" }));
    expect(curl).toContain("'it'\\''s'");
  });
});

describe('InterceptTable cURL button', () => {
  it('should copy a cURL command for the selected entry', () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    const entries = [buildEntry({ id: 1, url: 'https://api.x/c', method: 'POST', requestBody: '{"a":1}' })];
    render(<InterceptTable entries={entries} onClear={vi.fn()} />);

    fireEvent.click(within(dataRows()[0]).getByText('https://api.x/c'));
    fireEvent.click(screen.getByRole('button', { name: /copy as curl/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('-X POST');
  });
});
