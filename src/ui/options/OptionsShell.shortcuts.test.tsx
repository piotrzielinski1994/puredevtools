// @vitest-environment jsdom

import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CookieMapping,
  CookieSyncState,
  SyncResult,
} from "../../cookies/model";
import { flatten } from "../../cookies/tree";
import type { TreeNode } from "../../rules/model";
import { ToastProvider } from "../components/ui/toast";
import type { CookieGateway } from "../cookies/cookieGateway";
import { RulesProvider } from "../shared/RulesProvider";
import { ShortcutsProvider } from "../shared/ShortcutsProvider";
import { createFakeGateway, type FakeGateway } from "../shared/test-gateway";
import { OptionsShell } from "./OptionsShell";

// jsdom reports non-mac, so Mod resolves to Control. All the options shortcuts
// under test are driven with Control-based combos.

const mock = vi.hoisted(() => ({
  get: vi.fn(async () => ({})),
  set: vi.fn(async () => undefined),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: { get: mock.get, set: mock.set },
      onChanged: {
        addListener: mock.addListener,
        removeListener: mock.removeListener,
      },
    },
    cookies: { getAll: vi.fn(async () => []), set: vi.fn(async () => null) },
  },
}));

const cookieMapping = (over: Partial<CookieMapping> = {}): CookieMapping => ({
  id: "cm1",
  name: "prod -> local",
  enabled: true,
  sourceUrl: "https://app.prod.com",
  targetUrl: "http://localhost:3000",
  cookieNames: ["auth"],
  ...over,
});

const createFakeCookieGateway = (
  initial: CookieMapping[] = [],
  syncResult: SyncResult = { copied: ["auth"], skipped: [] },
): CookieGateway & {
  saved: CookieSyncState[];
  sync: ReturnType<typeof vi.fn>;
} => {
  const saved: CookieSyncState[] = [];
  return {
    saved,
    getAll: async () => ({
      tree: initial.map((mapping) => ({ kind: "mapping", mapping })),
    }),
    save: async (state) => {
      saved.push(state);
    },
    sync: vi.fn(async () => syncResult),
  };
};

const savedMappings = (state: CookieSyncState | undefined): CookieMapping[] =>
  state ? flatten(state.tree) : [];

const renderShell = (
  initial: TreeNode[] = [],
  cookieGateway = createFakeCookieGateway(),
): { rulesGateway: FakeGateway; cookieGateway: typeof cookieGateway } => {
  const rulesGateway = createFakeGateway(initial);
  render(
    <HotkeysProvider>
      <ShortcutsProvider>
        <RulesProvider gateway={rulesGateway}>
          <ToastProvider>
            <OptionsShell cookieGateway={cookieGateway} />
          </ToastProvider>
        </RulesProvider>
      </ShortcutsProvider>
    </HotkeysProvider>,
  );
  return { rulesGateway, cookieGateway };
};

const ruleNode = (id: string): TreeNode => ({
  kind: "rule",
  rule: {
    id,
    name: id,
    enabled: true,
    matchers: { url: { pattern: `https://${id}.test/*`, kind: "glob" } },
    actions: [{ type: "rewriteBody", body: "x" }],
  },
});

const openTabs = (): HTMLElement[] => {
  const tablists = screen.getAllByRole("tablist");
  const ruleTablist = tablists.find(
    (list) =>
      within(list).queryAllByRole("tab").length >= 0 &&
      !list.getAttribute("aria-label"),
  );
  return ruleTablist ? within(ruleTablist).getAllByRole("tab") : [];
};

const gotoCookieView = async () => {
  fireEvent.click(await screen.findByRole("tab", { name: /cookie sync/i }));
};

beforeEach(() => {
  mock.set.mockClear();
});

describe("OptionsShell keyboard shortcuts", () => {
  // TC-011, AC-005 side-effect-contract: Mod+S saves the active rule form.
  it("should persist the active rule if Mod+S is pressed in a draft form", async () => {
    const user = userEvent.setup();
    const { rulesGateway } = renderShell();

    fireEvent.click(await screen.findByRole("button", { name: /new rule/i }));
    const pattern = await screen.findByLabelText(/url pattern/i);
    fireEvent.change(pattern, { target: { value: "https://saved.test/*" } });

    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => expect(rulesGateway.addRule).toHaveBeenCalledTimes(1));
    expect(rulesGateway.addRule.mock.calls[0][0]).toMatchObject({
      matchers: { url: { pattern: "https://saved.test/*" } },
    });
  });

  // TC-012, AC-005/006 behavior: Mod+Alt+N in the Rules view opens a new draft tab.
  it("should open a new draft rule tab if Mod+Alt+N in the Rules view", async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole("button", { name: /new rule/i });

    await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");

    expect(
      await screen.findByRole("tab", { name: /new rule/i }),
    ).toBeInTheDocument();
  });

  // TC-013, AC-006 side-effect-contract: Mod+Alt+N in the Cookie-sync view adds a mapping.
  it("should add a cookie mapping if Mod+Alt+N in the Cookie-sync view", async () => {
    const user = userEvent.setup();
    const { cookieGateway } = renderShell([], createFakeCookieGateway([]));
    await gotoCookieView();
    await screen.findByText(/no cookie mappings/i);

    await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");

    await waitFor(() =>
      expect(savedMappings(cookieGateway.saved.at(-1)).length).toBe(1),
    );
  });

  // TC-014, AC-006 side-effect-contract: delete-item removes the active rule in Rules view.
  it("should delete the active rule if Mod+Backspace in the Rules view", async () => {
    const user = userEvent.setup();
    const { rulesGateway } = renderShell([ruleNode("r1")]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit: r1" }));
    await screen.findByRole("tab", { name: /r1/i });

    await user.keyboard("{Control>}{Backspace}{/Control}");

    await waitFor(() =>
      expect(rulesGateway.removeNode).toHaveBeenCalledWith("r1"),
    );
  });

  // TC-014, AC-006 side-effect-contract: delete-item removes the selected mapping in Cookie view.
  it("should delete the selected mapping if Mod+Backspace in the Cookie-sync view", async () => {
    const user = userEvent.setup();
    const { cookieGateway } = renderShell(
      [],
      createFakeCookieGateway([cookieMapping()]),
    );
    await gotoCookieView();
    await screen.findByDisplayValue("prod -> local");

    await user.keyboard("{Control>}{Backspace}{/Control}");

    await waitFor(() =>
      expect(savedMappings(cookieGateway.saved.at(-1))).toEqual([]),
    );
  });

  // TC-015, AC-006 side-effect-contract: Mod+Enter syncs the selected mapping for real.
  it("should sync the selected mapping if Mod+Enter in the Cookie-sync view", async () => {
    const user = userEvent.setup();
    const { cookieGateway } = renderShell(
      [],
      createFakeCookieGateway([cookieMapping()], {
        copied: ["auth", "sid"],
        skipped: [],
      }),
    );
    await gotoCookieView();
    await screen.findByDisplayValue("prod -> local");

    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(cookieGateway.sync).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/copied 2 cookie/i)).toBeInTheDocument();
  });

  // TC-015, AC-006 behavior: the stale fake "Saved" toast is gone from the Cookie view.
  it("should not show a fake Saved toast if Mod+S in the Cookie-sync view", async () => {
    const user = userEvent.setup();
    renderShell([], createFakeCookieGateway([cookieMapping()]));
    await gotoCookieView();
    await screen.findByDisplayValue("prod -> local");

    await user.keyboard("{Control>}s{/Control}");

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.queryByText(/^saved$/i)).not.toBeInTheDocument();
  });

  // TC-016, AC-005 behavior: Mod+Shift+V cycles Rules -> Cookie sync -> Shortcuts -> Rules.
  it("should cycle the active view if Mod+Shift+V is pressed", async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole("button", { name: /new rule/i });

    await user.keyboard("{Control>}{Shift>}v{/Shift}{/Control}");
    await waitFor(() =>
      expect(screen.getByText(/no cookie mappings/i)).toBeInTheDocument(),
    );

    await user.keyboard("{Control>}{Shift>}v{/Shift}{/Control}");
    expect(
      await screen.findByText(/toggle light\/dark|toggle theme/i),
    ).toBeInTheDocument();

    await user.keyboard("{Control>}{Shift>}v{/Shift}{/Control}");
    expect(
      await screen.findByRole("button", { name: /new rule/i }),
    ).toBeInTheDocument();
  });

  // TC-016, AC-010 behavior: open-shortcuts jumps straight to the Shortcuts view.
  it("should open the Shortcuts view if Mod+Shift+K is pressed", async () => {
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole("button", { name: /new rule/i });

    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");

    expect(
      await screen.findByText(/toggle light\/dark|toggle theme/i),
    ).toBeInTheDocument();
  });

  // TC-017, AC-005 behavior: next-tab / prev-tab move the active tab; close-tab closes it.
  it("should switch and close rule tabs with next/prev/close shortcuts", async () => {
    const user = userEvent.setup();
    renderShell([ruleNode("a1"), ruleNode("b2"), ruleNode("c3")]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit: a1" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit: b2" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit: c3" }));

    await screen.findByRole("tab", { name: /c3/i });
    const active = () =>
      openTabs().find((tab) => tab.getAttribute("aria-current") === "true");
    expect(active()?.textContent).toContain("c3");

    await user.keyboard("{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}");
    await waitFor(() => expect(active()?.textContent).toContain("b2"));

    await user.keyboard("{Control>}{Alt>}{ArrowRight}{/Alt}{/Control}");
    await waitFor(() => expect(active()?.textContent).toContain("c3"));

    await user.keyboard("{Alt>}w{/Alt}");
    await waitFor(() => expect(openTabs()).toHaveLength(2));
  });

  // TC-018, AC-005 side-effect-contract: export-rules fires its handler.
  it("should export rules if Alt+E is pressed", async () => {
    const user = userEvent.setup();
    const { rulesGateway } = renderShell([ruleNode("r1")]);
    await screen.findByRole("button", { name: "Edit: r1" });

    await user.keyboard("{Alt>}e{/Alt}");

    await waitFor(() =>
      expect(rulesGateway.exportToFile).toHaveBeenCalledTimes(1),
    );
  });

  // TC-018, AC-005 side-effect-contract: import-rules opens the file picker.
  it("should trigger the import file picker if Alt+I is pressed", async () => {
    const user = userEvent.setup();
    renderShell([ruleNode("r1")]);
    const fileInput = (await screen.findByTestId(
      "import-file-input",
    )) as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    await user.keyboard("{Alt>}i{/Alt}");

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
  });

  // TC-018, AC-005 side-effect-contract: collapse-all-folders collapses every folder.
  it("should collapse every folder if Mod+Shift+[ is pressed", async () => {
    const user = userEvent.setup();
    const { rulesGateway } = renderShell([
      {
        kind: "folder",
        id: "f1",
        name: "f1",
        collapsed: false,
        children: [ruleNode("c1")],
      },
    ]);
    await screen.findByLabelText("Folder: f1");

    await user.keyboard("{Control>}{Shift>}{[}{/Shift}{/Control}");

    await waitFor(() =>
      expect(rulesGateway.toggleCollapse).toHaveBeenCalledWith("f1"),
    );
  });

  // TC-018, AC-005 side-effect-contract: expand-all-folders expands every folder.
  it("should expand every folder if Mod+Shift+] is pressed", async () => {
    const user = userEvent.setup();
    const { rulesGateway } = renderShell([
      {
        kind: "folder",
        id: "f1",
        name: "f1",
        collapsed: true,
        children: [ruleNode("c1")],
      },
    ]);
    await screen.findByLabelText("Folder: f1");

    await user.keyboard("{Control>}{Shift>}{]}{/Shift}{/Control}");

    await waitFor(() =>
      expect(rulesGateway.toggleCollapse).toHaveBeenCalledWith("f1"),
    );
  });
});
