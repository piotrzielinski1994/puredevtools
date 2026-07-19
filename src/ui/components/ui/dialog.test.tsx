// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from './dialog';

describe('Dialog', () => {
  it('should render nothing if open is false', () => {
    // behavior: a closed dialog has no dialog role in the tree
    render(
      <Dialog open={false} onClose={vi.fn()} title="Unsaved changes">
        <p>body text</p>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('body text')).not.toBeInTheDocument();
  });

  it('should render a modal dialog with the title and children if open is true', () => {
    // behavior: an open dialog exposes role/aria-modal, the title, and its children
    render(
      <Dialog open onClose={vi.fn()} title="Unsaved changes">
        <p>body text</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByText('body text')).toBeInTheDocument();
  });

  it('should call onClose once if Escape is pressed', () => {
    // side-effect-contract: Escape dismisses the dialog
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Unsaved changes">
        <p>body text</p>
      </Dialog>,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose if the overlay behind the panel is clicked', () => {
    // side-effect-contract: clicking the backdrop dismisses the dialog
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Unsaved changes">
        <p>body text</p>
      </Dialog>,
    );

    const overlay = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should not call onClose if the panel interior is clicked', () => {
    // behavior: clicks inside the panel do not dismiss the dialog
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Unsaved changes">
        <p>body text</p>
      </Dialog>,
    );

    fireEvent.click(screen.getByText('body text'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
