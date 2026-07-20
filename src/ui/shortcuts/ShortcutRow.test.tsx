import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { formatForDisplay } from '@tanstack/hotkeys';
import { STORAGE_KEYS } from '../../shared/constants';
import {
  SHORTCUT_ACTIONS,
  type ShortcutActionId,
  type ShortcutOverrides,
} from '../../shortcuts/registry';
import { resolveShortcuts } from '../../shortcuts/resolve';
import { ShortcutsProvider } from '../shared/ShortcutsProvider';
import { ShortcutRow } from './ShortcutRow';

// jsdom reports non-mac, so Control+Y canonicalizes to the free "Mod+Y".

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

const SAVE_RULE = SHORTCUT_ACTIONS.find((a) => a.id === 'save-rule')!;

const renderRow = (overrides: ShortcutOverrides = {}) => {
  mock.backing[STORAGE_KEYS.shortcuts] = overrides;
  const effective = resolveShortcuts(overrides);
  const bindings = effective['save-rule'];
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, 'save-rule');
  return render(
    <HotkeysProvider>
      <ShortcutsProvider>
        <ShortcutRow
          action={SAVE_RULE}
          bindings={bindings}
          effective={effective}
          hasOverride={hasOverride}
        />
      </ShortcutsProvider>
    </HotkeysProvider>,
  );
};

const persistedOverrides = () => {
  const call = mock.set.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
  return call?.[STORAGE_KEYS.shortcuts] as ShortcutOverrides | undefined;
};

const owns = (id: ShortcutActionId) => resolveShortcuts({})[id][0];

beforeEach(() => {
  Object.keys(mock.backing).forEach((key) => delete mock.backing[key]);
  mock.set.mockClear();
});

describe('ShortcutRow', () => {
  // TC-026 behavior: the row shows the action name and its binding chip.
  it('should render the action name and its binding chip', async () => {
    renderRow();
    expect(await screen.findByText(SAVE_RULE.name)).toBeInTheDocument();
    expect(screen.getByText(formatForDisplay(SAVE_RULE.defaultHotkey))).toBeInTheDocument();
  });

  // TC-027 behavior: clicking a chip arms the recorder in that chip place.
  it('should turn a binding chip into a recorder if the chip is clicked', async () => {
    const user = userEvent.setup();
    renderRow({ 'save-rule': ['Mod+J'] });

    const chip = await screen.findByRole('button', {
      name: `Edit ${formatForDisplay('Mod+J')} for ${SAVE_RULE.name}`,
    });
    await user.click(chip);

    expect(await screen.findByText('Press keys…')).toBeInTheDocument();
    expect(screen.queryByText(formatForDisplay('Mod+J'))).not.toBeInTheDocument();
  });

  // TC-027, AC-011 side-effect-contract: recording a free combo replaces the chip in place.
  it('should replace the clicked binding in place if a free combo is recorded', async () => {
    const user = userEvent.setup();
    renderRow({ 'save-rule': ['Mod+J', 'Mod+G'] });

    const chip = await screen.findByRole('button', {
      name: `Edit ${formatForDisplay('Mod+J')} for ${SAVE_RULE.name}`,
    });
    await user.click(chip);
    await user.keyboard('{Control>}y{/Control}');

    await waitFor(() =>
      expect(persistedOverrides()?.['save-rule']).toEqual(['Mod+Y', 'Mod+G']),
    );
  });

  // TC-030, AC-011 behavior: editing to a combo owned by another action is blocked.
  it('should keep the clicked binding and alert if an edit conflicts', async () => {
    const user = userEvent.setup();
    renderRow({ 'save-rule': ['Mod+J'] });

    const chip = await screen.findByRole('button', {
      name: `Edit ${formatForDisplay('Mod+J')} for ${SAVE_RULE.name}`,
    });
    await user.click(chip);

    // delete-item owns Mod+Backspace by default -> conflict.
    const deleteKey = owns('delete-item');
    void deleteKey;
    await user.keyboard('{Control>}{Backspace}{/Control}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/delete/i);
    expect(mock.set).not.toHaveBeenCalled();
    expect(screen.getByText(formatForDisplay('Mod+J'))).toBeInTheDocument();
  });

  // TC-027 behavior: cancelling an edit restores the original chip untouched.
  it('should restore the binding chip if the edit recorder is cancelled', async () => {
    const user = userEvent.setup();
    renderRow({ 'save-rule': ['Mod+J'] });

    const chip = await screen.findByRole('button', {
      name: `Edit ${formatForDisplay('Mod+J')} for ${SAVE_RULE.name}`,
    });
    await user.click(chip);
    await screen.findByText('Press keys…');

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(
      await screen.findByRole('button', {
        name: `Edit ${formatForDisplay('Mod+J')} for ${SAVE_RULE.name}`,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument();
  });

  // TC-027 behavior: pressing Escape while editing restores the original chip.
  it('should restore the binding chip if Escape is pressed while editing', async () => {
    const user = userEvent.setup();
    renderRow({ 'save-rule': ['Mod+J'] });

    const chip = await screen.findByRole('button', {
      name: `Edit ${formatForDisplay('Mod+J')} for ${SAVE_RULE.name}`,
    });
    await user.click(chip);
    await screen.findByText('Press keys…');

    await user.keyboard('{Escape}');

    expect(
      await screen.findByRole('button', {
        name: `Edit ${formatForDisplay('Mod+J')} for ${SAVE_RULE.name}`,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument();
  });

  // TC-028, AC-004 side-effect-contract: removing one binding drops just that binding.
  it('should persist the removal of one binding if its remove control is clicked', async () => {
    const user = userEvent.setup();
    renderRow({ 'save-rule': ['Mod+J', 'Mod+Y'] });

    const removeButton = await screen.findByRole('button', {
      name: `Remove ${formatForDisplay('Mod+Y')} from ${SAVE_RULE.name}`,
    });
    await user.click(removeButton);

    await waitFor(() => expect(persistedOverrides()?.['save-rule']).toEqual(['Mod+J']));
  });
});
