// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CookieMapping } from '../../cookies/model';
import { CookieMappingForm } from './CookieMappingForm';

const mapping = (over: Partial<CookieMapping> = {}): CookieMapping => ({
  id: 'cm1',
  name: 'prod -> local',
  enabled: true,
  sourceUrl: 'https://app.prod.com',
  targetUrl: 'http://localhost:3000',
  cookieNames: ['auth', 'sid'],
  ...over,
});

const renderForm = (over: Partial<CookieMapping> = {}) => {
  const onChange = vi.fn();
  const onDelete = vi.fn();
  const onSync = vi.fn();
  render(<CookieMappingForm mapping={mapping(over)} onChange={onChange} onDelete={onDelete} onSync={onSync} />);
  return { onChange, onDelete, onSync };
};

describe('CookieMappingForm', () => {
  it('should render the cookie names joined by comma-space', () => {
    renderForm();
    expect(screen.getByLabelText(/cookie names/i)).toHaveValue('auth, sid');
  });

  it('should patch the name on edit', () => {
    const { onChange } = renderForm();
    fireEvent.change(screen.getByLabelText(/mapping name/i), { target: { value: 'new name' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'new name' }));
  });

  it('should patch the source url on edit', () => {
    const { onChange } = renderForm();
    fireEvent.change(screen.getByLabelText(/source url/i), { target: { value: 'https://x.com' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sourceUrl: 'https://x.com' }));
  });

  it('should patch the target url on edit', () => {
    const { onChange } = renderForm();
    fireEvent.change(screen.getByLabelText(/target url/i), { target: { value: 'http://localhost:9' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ targetUrl: 'http://localhost:9' }));
  });

  it('should parse comma separated cookie names into a trimmed array', () => {
    const { onChange } = renderForm({ cookieNames: [] });
    fireEvent.change(screen.getByLabelText(/cookie names/i), { target: { value: 'auth,  sid , refresh' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cookieNames: ['auth', 'sid', 'refresh'] }));
  });

  it('should call onSync when Sync now is clicked', () => {
    const { onSync } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('should disable Sync now when the source url is empty', () => {
    renderForm({ sourceUrl: '' });
    expect(screen.getByRole('button', { name: /sync now/i })).toBeDisabled();
  });

  it('should call onDelete when the delete button is clicked', () => {
    const { onDelete } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /delete mapping/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
