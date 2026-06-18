// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeSwitch } from './ThemeSwitch';

describe('ThemeSwitch', () => {
  it('should reflect the current theme as a checked switch when dark', () => {
    render(<ThemeSwitch theme="dark" onChange={vi.fn()} />);
    expect(screen.getByRole('switch', { name: /dark mode/i })).toBeChecked();
  });

  it('should reflect light theme as an unchecked switch', () => {
    render(<ThemeSwitch theme="light" onChange={vi.fn()} />);
    expect(screen.getByRole('switch', { name: /dark mode/i })).not.toBeChecked();
  });

  it('should call onChange with dark when toggled on from light', () => {
    const onChange = vi.fn();
    render(<ThemeSwitch theme="light" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: /dark mode/i }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('should call onChange with light when toggled off from dark', () => {
    const onChange = vi.fn();
    render(<ThemeSwitch theme="dark" onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: /dark mode/i }));
    expect(onChange).toHaveBeenCalledWith('light');
  });
});
