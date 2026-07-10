import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from './switch';

describe('Switch', () => {
  it('should fire onChange when the visible track (not the hidden input) is clicked', () => {
    const onChange = vi.fn();
    render(<Switch aria-label="toggle" checked={false} onChange={onChange} />);

    const track = screen.getByLabelText('toggle').closest('label');
    expect(track).not.toBeNull();
    fireEvent.click(track as HTMLLabelElement);

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
