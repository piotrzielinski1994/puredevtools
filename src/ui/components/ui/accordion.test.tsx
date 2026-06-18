// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Accordion } from './accordion';

describe('Accordion', () => {
  it('should render the title as an expandable button', () => {
    render(
      <Accordion title="Mock response">
        <p>inner content</p>
      </Accordion>,
    );
    expect(screen.getByRole('button', { name: /mock response/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('should keep children mounted even when collapsed', () => {
    render(
      <Accordion title="Mock response">
        <p>inner content</p>
      </Accordion>,
    );
    expect(screen.getByText('inner content')).toBeInTheDocument();
  });

  it('should expand when the header is clicked', () => {
    render(
      <Accordion title="Mock response">
        <p>inner content</p>
      </Accordion>,
    );
    fireEvent.click(screen.getByRole('button', { name: /mock response/i }));
    expect(screen.getByRole('button', { name: /mock response/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('should start open when defaultOpen is set', () => {
    render(
      <Accordion title="Match" defaultOpen>
        <p>inner content</p>
      </Accordion>,
    );
    expect(screen.getByRole('button', { name: /match/i })).toHaveAttribute('aria-expanded', 'true');
  });
});
