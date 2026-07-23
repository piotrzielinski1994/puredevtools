import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../shared/constants";
import { ShortcutsProvider } from "../shared/ShortcutsProvider";
import { App } from "./App";

// jsdom reports non-mac, so Mod resolves to Control. toggle-global = Mod+Shift+G,
// toggle-theme = Mod+Shift+L.

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

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: { get: mock.get, set: mock.set },
      onChanged: {
        addListener: mock.addListener,
        removeListener: mock.removeListener,
      },
    },
    runtime: { openOptionsPage: vi.fn() },
  },
}));

const renderApp = () =>
  render(
    <HotkeysProvider>
      <ShortcutsProvider>
        <App />
      </ShortcutsProvider>
    </HotkeysProvider>,
  );

const globalSwitch = () =>
  screen.getByRole("switch", { name: /global enabled/i }) as HTMLInputElement;

beforeEach(() => {
  Object.keys(mock.backing).forEach((key) => {
    delete mock.backing[key];
  });
  mock.set.mockClear();
  document.documentElement.classList.remove("dark");
});

describe("popup App keyboard shortcuts", () => {
  // TC-024, AC-008 behavior: Mod+Shift+G flips the global switch off.
  it("should toggle the global switch off if Mod+Shift+G is pressed", async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => expect(globalSwitch().checked).toBe(true));

    await user.keyboard("{Control>}{Shift>}g{/Shift}{/Control}");

    await waitFor(() => expect(globalSwitch().checked).toBe(false));
  });

  // TC-024, AC-008 side-effect-contract: the toggle persists the new global flag.
  it("should persist the disabled global flag if Mod+Shift+G is pressed", async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => expect(globalSwitch().checked).toBe(true));

    await user.keyboard("{Control>}{Shift>}g{/Shift}{/Control}");

    await waitFor(() => {
      const persisted = mock.set.mock.calls.map(
        (call) => call[0] as Record<string, unknown>,
      );
      expect(
        persisted.some((items) => items[STORAGE_KEYS.globalEnabled] === false),
      ).toBe(true);
    });
  });

  // TC-024, AC-008 behavior: Mod+Shift+L switches the theme to dark.
  it("should switch the theme to dark if Mod+Shift+L is pressed", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("switch", { name: /global enabled/i });

    await user.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");

    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
  });

  // TC-024, AC-008 side-effect-contract: the theme toggle persists 'dark'.
  it("should persist the dark theme if Mod+Shift+L is pressed", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("switch", { name: /global enabled/i });

    await user.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");

    await waitFor(() => {
      const persisted = mock.set.mock.calls.map(
        (call) => call[0] as Record<string, unknown>,
      );
      expect(
        persisted.some((items) => items[STORAGE_KEYS.theme] === "dark"),
      ).toBe(true);
    });
  });
});
