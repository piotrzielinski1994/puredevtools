import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ShortcutActionId,
  ShortcutOverrides,
} from "../../shortcuts/registry";
import { ShortcutsProvider } from "./ShortcutsProvider";
import { useActionHotkeys } from "./useActionHotkeys";

// jsdom reports a non-mac platform, so Mod resolves to Control - the tests fire
// Control-based combos to trigger a "Mod+..".

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
  },
}));

const Harness = ({
  handlers,
}: {
  handlers: Partial<Record<ShortcutActionId, () => void>>;
}) => {
  useActionHotkeys(handlers);
  return (
    <div>
      <span data-testid="ready">ready</span>
      <input data-testid="text-input" aria-label="some field" />
    </div>
  );
};

const withProviders = (
  children: ReactNode,
  overrides: ShortcutOverrides = {},
) => {
  mock.backing["puredevtools.shortcuts"] = overrides;
  return (
    <HotkeysProvider>
      <ShortcutsProvider>{children}</ShortcutsProvider>
    </HotkeysProvider>
  );
};

const renderHarness = (
  handlers: Partial<Record<ShortcutActionId, () => void>>,
  overrides: ShortcutOverrides = {},
) => render(withProviders(<Harness handlers={handlers} />, overrides));

beforeEach(() => {
  Object.keys(mock.backing).forEach((key) => {
    delete mock.backing[key];
  });
});

describe("useActionHotkeys", () => {
  // TC-008 behavior: the default hotkey fires its handler (toggle-theme = Mod+Shift+L).
  it("should run the handler if the action default hotkey is pressed", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();

    renderHarness({ "toggle-theme": toggle });
    await screen.findByTestId("ready");

    await user.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  // TC-008 behavior: an overridden hotkey fires the handler.
  it("should run the handler on the overridden hotkey if an override is set", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();

    renderHarness({ "toggle-theme": toggle }, { "toggle-theme": ["Mod+J"] });
    await screen.findByTestId("ready");

    await user.keyboard("{Control>}j{/Control}");

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  // TC-009 behavior: every binding of a multi-binding action fires the handler.
  it("should run the handler on each bound hotkey if the action has several", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();

    renderHarness(
      { "toggle-theme": toggle },
      { "toggle-theme": ["Mod+J", "Mod+K"] },
    );
    await screen.findByTestId("ready");

    await user.keyboard("{Control>}j{/Control}");
    await user.keyboard("{Control>}k{/Control}");

    expect(toggle).toHaveBeenCalledTimes(2);
  });

  // TC-010 behavior: a disabled ([]) action never fires.
  it("should not run the handler if the action is disabled with an empty list", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();

    renderHarness({ "toggle-theme": toggle }, { "toggle-theme": [] });
    await screen.findByTestId("ready");

    await user.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");

    expect(toggle).not.toHaveBeenCalled();
  });

  // AC-004 behavior: only the surface provided handlers are active.
  it("should not fire an action whose handler is not supplied", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();

    renderHarness({ "toggle-theme": toggle });
    await screen.findByTestId("ready");

    // toggle-global (Mod+Shift+G) has no handler here.
    await user.keyboard("{Control>}{Shift>}g{/Shift}{/Control}");

    expect(toggle).not.toHaveBeenCalled();
  });

  // AC-004 behavior: a Mod-combo still fires while focus is in a text input.
  it("should run a Mod-combo handler even if focus is in a text input", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();

    renderHarness({ "toggle-theme": toggle });
    await screen.findByTestId("ready");

    await user.click(screen.getByTestId("text-input"));
    await user.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");

    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
