import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterceptReport } from "../../engine/page/types";
import { ShortcutsProvider } from "../shared/ShortcutsProvider";
import { Panel } from "./main";

// jsdom reports non-mac; clear-log = Alt+C and focus-filter = Alt+F are Alt-based
// so they are platform-independent. A fake devtools port lets us push a report
// into the log, then exercise the two panel shortcuts.

const portMock = vi.hoisted(() => {
  const listeners = new Set<(message: unknown) => void>();
  return {
    listeners,
    connect: vi.fn(() => ({
      postMessage: vi.fn(),
      onMessage: {
        addListener: (listener: (message: unknown) => void) =>
          portMock.listeners.add(listener),
        removeListener: (listener: (message: unknown) => void) =>
          portMock.listeners.delete(listener),
      },
      disconnect: vi.fn(),
    })),
    push(report: InterceptReport) {
      portMock.listeners.forEach((listener) => {
        listener({ type: "report", report });
      });
    },
  };
});

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { connect: portMock.connect },
    devtools: { inspectedWindow: { tabId: 42 } },
  },
}));

const report = (over: Partial<InterceptReport> = {}): InterceptReport => ({
  kind: "rewrite",
  method: "GET",
  url: "https://api.x/users",
  status: 200,
  body: '{"a":1}',
  ...over,
});

const renderPanel = () =>
  render(
    <HotkeysProvider>
      <ShortcutsProvider>
        <Panel />
      </ShortcutsProvider>
    </HotkeysProvider>,
  );

const dataRows = (): HTMLElement[] =>
  screen
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("columnheader").length === 0);

beforeEach(() => {
  portMock.listeners.clear();
  portMock.connect.mockClear();
});

describe("devtools Panel keyboard shortcuts", () => {
  // TC-025, AC-009 behavior: Alt+C clears the intercept log.
  it("should clear the intercept log if Alt+C is pressed", async () => {
    const user = userEvent.setup();
    renderPanel();

    act(() => {
      portMock.push(report({ url: "https://api.x/one" }));
    });
    await waitFor(() => expect(dataRows()).toHaveLength(1));

    await user.keyboard("{Alt>}c{/Alt}");

    await waitFor(() => expect(dataRows()).toHaveLength(0));
    expect(screen.getByText(/no intercepted requests/i)).toBeInTheDocument();
  });

  // TC-025, AC-009 behavior: Alt+F focuses the URL filter input.
  it("should focus the URL filter input if Alt+F is pressed", async () => {
    const user = userEvent.setup();
    renderPanel();

    const filter = screen.getByRole("textbox", { name: /filter by url/i });
    expect(filter).not.toHaveFocus();

    await user.keyboard("{Alt>}f{/Alt}");

    await waitFor(() => expect(filter).toHaveFocus());
    expect(document.activeElement).toBe(filter);
  });
});
