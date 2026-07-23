import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../shared/constants";
import { SHORTCUT_ACTIONS } from "../../shortcuts/registry";
import {
  ShortcutsProvider,
  useShortcutOverrides,
  useShortcuts,
} from "./ShortcutsProvider";

type StorageChange = { newValue?: unknown; oldValue?: unknown };
type ChangeListener = (
  changes: Record<string, StorageChange>,
  areaName: string,
) => void;

const mock = vi.hoisted(() => {
  const backing: Record<string, unknown> = {};
  const listeners = new Set<ChangeListener>();
  return {
    backing,
    listeners,
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
    addListener: vi.fn((listener: ChangeListener) => {
      mock.listeners.add(listener);
    }),
    removeListener: vi.fn((listener: ChangeListener) => {
      mock.listeners.delete(listener);
    }),
    emit(changes: Record<string, StorageChange>, areaName = "local") {
      mock.listeners.forEach((listener) => {
        listener(changes, areaName);
      });
    },
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

const SAVE_DEFAULT = SHORTCUT_ACTIONS.find(
  (a) => a.id === "save-rule",
)!.defaultHotkey;

const Probe = () => {
  const overrides = useShortcutOverrides();
  const { addShortcut, removeShortcut, replaceShortcut, resetShortcut } =
    useShortcuts();
  const binding = overrides["save-rule"];
  return (
    <div>
      <span data-testid="save-rule">
        {binding === undefined ? "none" : JSON.stringify(binding)}
      </span>
      <button type="button" onClick={() => addShortcut("save-rule", "Mod+Y")}>
        add
      </button>
      <button type="button" onClick={() => addShortcut("save-rule", "Mod+G")}>
        add second
      </button>
      <button
        type="button"
        onClick={() => removeShortcut("save-rule", "Mod+Y")}
      >
        remove added
      </button>
      <button
        type="button"
        onClick={() => removeShortcut("save-rule", SAVE_DEFAULT)}
      >
        remove default
      </button>
      <button
        type="button"
        onClick={() => replaceShortcut("save-rule", SAVE_DEFAULT, "Mod+Y")}
      >
        replace default
      </button>
      <button
        type="button"
        onClick={() => replaceShortcut("save-rule", "Mod+X", "Mod+Y")}
      >
        replace absent
      </button>
      <button type="button" onClick={() => resetShortcut("save-rule")}>
        reset
      </button>
    </div>
  );
};

const renderProvider = () =>
  render(
    <ShortcutsProvider>
      <Probe />
    </ShortcutsProvider>,
  );

const value = () => screen.getByTestId("save-rule").textContent;

beforeEach(() => {
  Object.keys(mock.backing).forEach((key) => {
    delete mock.backing[key];
  });
  mock.listeners.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.addListener.mockClear();
  mock.removeListener.mockClear();
});

describe("ShortcutsProvider mutators", () => {
  // behavior: no override -> the consumer sees "none" initially.
  it("should expose no override for an untouched action", async () => {
    renderProvider();
    await screen.findByTestId("save-rule");
    await waitFor(() => expect(value()).toBe("none"));
  });

  // behavior: adding a binding seeds the default then appends the new one.
  it("should seed the default then append the new binding if addShortcut is called", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(value()).toBe(JSON.stringify([SAVE_DEFAULT, "Mod+Y"])),
    );
  });

  // side-effect-contract: the appended override persists under the shortcuts key.
  it("should persist the appended override via storage.local.set", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const persisted = mock.set.mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(persisted?.[STORAGE_KEYS.shortcuts]).toEqual({
        "save-rule": [SAVE_DEFAULT, "Mod+Y"],
      });
    });
  });

  // behavior: a duplicate add is a no-op (no twin binding).
  it("should not add a duplicate binding if the hotkey is already present", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(value()).toBe(JSON.stringify([SAVE_DEFAULT, "Mod+Y"])),
    );
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(value()).toBe(JSON.stringify([SAVE_DEFAULT, "Mod+Y"])),
    );
  });

  // behavior: removing the only (default) binding leaves an explicit empty list (disabled).
  it("should disable the action with an empty list if the last binding is removed", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /remove default/i }));

    await waitFor(() => expect(value()).toBe(JSON.stringify([])));
  });

  // behavior: removing one of several keeps the rest.
  it("should remove one binding but keep the rest if removeShortcut is called", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(value()).toBe(JSON.stringify([SAVE_DEFAULT, "Mod+Y"])),
    );

    await user.click(screen.getByRole("button", { name: /remove added/i }));

    await waitFor(() => expect(value()).toBe(JSON.stringify([SAVE_DEFAULT])));
  });

  // behavior: replace swaps the old binding for the new one in place.
  it("should swap one binding in place if replaceShortcut is called", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /add second/i }));
    await waitFor(() =>
      expect(value()).toBe(JSON.stringify([SAVE_DEFAULT, "Mod+G"])),
    );

    await user.click(screen.getByRole("button", { name: /replace default/i }));

    await waitFor(() =>
      expect(value()).toBe(JSON.stringify(["Mod+Y", "Mod+G"])),
    );
  });

  // behavior: replacing a binding the action does not hold is a no-op (no override written).
  it("should leave the action untouched if replaceShortcut targets an absent binding", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /replace absent/i }));

    await waitFor(() => expect(value()).toBe("none"));
  });

  // behavior: reset removes the override entirely; the action returns to "none".
  it("should remove the override entirely if resetShortcut is called", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(value()).toBe(JSON.stringify([SAVE_DEFAULT, "Mod+Y"])),
    );

    await user.click(screen.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => expect(value()).toBe("none"));
  });

  // side-effect-contract: reset persists a map without the reset action key.
  it("should persist the removal of the override key if resetShortcut is called", async () => {
    const user = userEvent.setup();
    renderProvider();
    await screen.findByTestId("save-rule");

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.click(screen.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => {
      const persisted = mock.set.mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      const stored = persisted?.[STORAGE_KEYS.shortcuts] as
        | Record<string, unknown>
        | undefined;
      expect(stored).not.toHaveProperty("save-rule");
    });
  });
});

describe("ShortcutsProvider live sync", () => {
  // TC-033 behavior: an override written by another root is picked up via storage.onChanged.
  it("should reflect a change delivered through storage.onChanged", async () => {
    renderProvider();
    await screen.findByTestId("save-rule");
    await waitFor(() => expect(value()).toBe("none"));

    mock.emit({
      [STORAGE_KEYS.shortcuts]: { newValue: { "save-rule": ["Mod+Y"] } },
    });

    await waitFor(() => expect(value()).toBe(JSON.stringify(["Mod+Y"])));
  });

  // TC-033 behavior: a change on an unrelated area is ignored.
  it("should ignore a change on a non-local storage area", async () => {
    renderProvider();
    await screen.findByTestId("save-rule");
    await waitFor(() => expect(value()).toBe("none"));

    mock.emit(
      { [STORAGE_KEYS.shortcuts]: { newValue: { "save-rule": ["Mod+Y"] } } },
      "sync",
    );

    await waitFor(() => expect(value()).toBe("none"));
  });

  // TC-033 behavior: the initial stored value is loaded on mount.
  it("should load the stored overrides on mount", async () => {
    mock.backing[STORAGE_KEYS.shortcuts] = { "save-rule": ["Mod+G"] };
    renderProvider();
    await screen.findByTestId("save-rule");

    await waitFor(() => expect(value()).toBe(JSON.stringify(["Mod+G"])));
  });
});
