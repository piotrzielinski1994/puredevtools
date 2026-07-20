import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { formatForDisplay } from '@tanstack/hotkeys';
import { STORAGE_KEYS } from '../../shared/constants';
import { SHORTCUT_ACTIONS, type ShortcutOverrides } from '../../shortcuts/registry';
import { ShortcutsProvider } from '../shared/ShortcutsProvider';
import { ShortcutsSection } from './ShortcutsSection';

// jsdom reports a non-mac platform, so recording Control+Y canonicalizes to
// "Mod+Y" (unused by any action -> free).

const mock = vi.hoisted(() => {
  const backing: Record<string, unknown> = {};
  return {
    backing,
    get: vi.fn(async (keys: string[]) => {
      const out: Record<string, unknown> = {};
      keys.forEach((key) => {
        if (key in backing) out[key] = backing[key];
      });
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
});

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: { get: mock.get, set: mock.set },
      onChanged: { addListener: mock.addListener, removeListener: mock.removeListener },
    },
  },
}));

const renderSection = (overrides: ShortcutOverrides = {}) => {
  mock.backing[STORAGE_KEYS.shortcuts] = overrides;
  return render(
    <HotkeysProvider>
      <ShortcutsProvider>
        <ShortcutsSection />
      </ShortcutsProvider>
    </HotkeysProvider>,
  );
};

const SAVE_RULE = SHORTCUT_ACTIONS.find((a) => a.id === 'save-rule')!;
const DELETE_ITEM = SHORTCUT_ACTIONS.find((a) => a.id === 'delete-item')!;

const persistedOverrides = () => {
  const call = mock.set.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
  return call?.[STORAGE_KEYS.shortcuts] as ShortcutOverrides | undefined;
};

beforeEach(() => {
  Object.keys(mock.backing).forEach((key) => delete mock.backing[key]);
  mock.set.mockClear();
});

describe('ShortcutsSection', () => {
  // TC-026 behavior: one row per registry action.
  it('should render a row for every registry action', async () => {
    renderSection();
    for (const action of SHORTCUT_ACTIONS) {
      expect(await screen.findByText(action.name)).toBeInTheDocument();
    }
  });

  // TC-026 behavior: each action shows its default binding formatted for display.
  it('should show each action current binding formatted for display', async () => {
    renderSection();
    const label = formatForDisplay(SAVE_RULE.defaultHotkey);
    expect(await screen.findAllByText(label)).not.toHaveLength(0);
  });

  // TC-026 behavior: a multi-binding action renders a chip per binding.
  it('should render a chip for every binding if an action has several', async () => {
    renderSection({ 'save-rule': ['Mod+J', 'Mod+Y'] });
    expect(await screen.findByText(formatForDisplay('Mod+J'))).toBeInTheDocument();
    expect(screen.getByText(formatForDisplay('Mod+Y'))).toBeInTheDocument();
  });

  // TC-027, AC-011 side-effect-contract: recording a free combo appends + persists.
  it('should persist an appended binding if a new free combo is recorded', async () => {
    const user = userEvent.setup();
    renderSection();

    const addButton = await screen.findByRole('button', {
      name: new RegExp(`add shortcut for ${SAVE_RULE.name}`, 'i'),
    });
    await user.click(addButton);
    await user.keyboard('{Control>}y{/Control}');

    await waitFor(() => expect(mock.set).toHaveBeenCalled());
    await waitFor(() =>
      expect(persistedOverrides()?.['save-rule']).toEqual([SAVE_RULE.defaultHotkey, 'Mod+Y']),
    );
  });

  // TC-027 behavior: the newly recorded chip becomes visible.
  it('should show the new binding chip after a free combo is recorded', async () => {
    const user = userEvent.setup();
    renderSection();

    const addButton = await screen.findByRole('button', {
      name: new RegExp(`add shortcut for ${SAVE_RULE.name}`, 'i'),
    });
    await user.click(addButton);
    await user.keyboard('{Control>}y{/Control}');

    expect(await screen.findByText(formatForDisplay('Mod+Y'))).toBeInTheDocument();
  });

  // TC-028, AC-004 behavior: removing the last binding shows the disabled state.
  it('should show a disabled state if the last binding is removed', async () => {
    const user = userEvent.setup();
    renderSection({ 'save-rule': ['Mod+J'] });

    const removeButton = await screen.findByRole('button', {
      name: `Remove ${formatForDisplay('Mod+J')} from ${SAVE_RULE.name}`,
    });
    await user.click(removeButton);

    expect(await screen.findByText('(disabled)')).toBeInTheDocument();
  });

  // TC-029, AC-010 side-effect-contract: reset removes the override, default returns.
  it('should remove the override and restore the default if reset is clicked', async () => {
    const user = userEvent.setup();
    renderSection({ 'save-rule': ['Mod+K'] });

    const resetButton = await screen.findByRole('button', {
      name: new RegExp(`reset.*${SAVE_RULE.name}`, 'i'),
    });
    await user.click(resetButton);

    await waitFor(() => expect(persistedOverrides()).not.toHaveProperty('save-rule'));
    expect(
      await screen.findByText(formatForDisplay(SAVE_RULE.defaultHotkey)),
    ).toBeInTheDocument();
  });

  // TC-029, AC-010 behavior: the Reset button is hidden when no override exists.
  it('should not show a Reset button for an action without an override', async () => {
    renderSection();
    await screen.findByText(SAVE_RULE.name);
    expect(
      screen.queryByRole('button', { name: new RegExp(`reset.*${SAVE_RULE.name}`, 'i') }),
    ).not.toBeInTheDocument();
  });

  // TC-030, AC-011 behavior: recording an in-use combo names the owner and does not persist.
  it('should name the owning action and not persist if a used combo is recorded', async () => {
    const user = userEvent.setup();
    renderSection();

    const addButton = await screen.findByRole('button', {
      name: new RegExp(`add shortcut for ${DELETE_ITEM.name}`, 'i'),
    });
    await user.click(addButton);

    // save-rule owns Mod+S by default; recording it for delete-item conflicts.
    await user.keyboard('{Control>}s{/Control}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(new RegExp(SAVE_RULE.name, 'i'));
    expect(mock.set).not.toHaveBeenCalled();
  });
});
