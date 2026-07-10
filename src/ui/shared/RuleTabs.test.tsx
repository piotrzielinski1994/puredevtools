// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RuleTabs } from './RuleTabs';

type Tab = { key: string; label: string };

const tabs: Tab[] = [
  { key: 'a', label: 'alpha rule' },
  { key: 'b', label: 'bravo rule' },
  { key: 'new:draft', label: 'New rule' },
];

describe('RuleTabs', () => {
  it('should render one tab label per entry (AC-004)', () => {
    // behavior: every provided tab renders its label
    render(<RuleTabs tabs={tabs} activeKey="a" onActivate={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('alpha rule')).toBeInTheDocument();
    expect(screen.getByText('bravo rule')).toBeInTheDocument();
    expect(screen.getByText('New rule')).toBeInTheDocument();
  });

  it('should call onActivate with the tab key if a tab is clicked (AC-004)', () => {
    // side-effect-contract: clicking a tab activates that key
    const onActivate = vi.fn<(key: string) => void>();
    render(<RuleTabs tabs={tabs} activeKey="a" onActivate={onActivate} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('bravo rule'));

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith('b');
  });

  it('should call onClose with the tab key if that tab close control is clicked (AC-007)', () => {
    // side-effect-contract: the per-tab close control closes only that key
    const onClose = vi.fn<(key: string) => void>();
    render(<RuleTabs tabs={tabs} activeKey="a" onActivate={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close bravo rule/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('b');
  });

  it('should not call onActivate if the close control is clicked (AC-007)', () => {
    // behavior: closing a tab must not also activate it
    const onActivate = vi.fn<(key: string) => void>();
    const onClose = vi.fn<(key: string) => void>();
    render(<RuleTabs tabs={tabs} activeKey="a" onActivate={onActivate} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close alpha rule/i }));

    expect(onClose).toHaveBeenCalledWith('a');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('should expose a close control for every tab (AC-007)', () => {
    // behavior: each tab has its own labelled close control
    render(<RuleTabs tabs={tabs} activeKey="a" onActivate={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /close alpha rule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close bravo rule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close new rule/i })).toBeInTheDocument();
  });

  it('should mark the active tab with an accessible current cue (AC-004)', () => {
    // behavior: the active tab is distinguishable via aria-current
    render(<RuleTabs tabs={tabs} activeKey="b" onActivate={vi.fn()} onClose={vi.fn()} />);

    const current = document.querySelector('[aria-current="true"], [aria-current="page"]');
    expect(current).not.toBeNull();
    expect(current?.textContent).toContain('bravo rule');
  });

  it('should render nothing selectable as current if activeKey is null', () => {
    // behavior: with no active key there is no aria-current tab
    render(<RuleTabs tabs={tabs} activeKey={null} onActivate={vi.fn()} onClose={vi.fn()} />);

    expect(document.querySelector('[aria-current="true"], [aria-current="page"]')).toBeNull();
  });
});
