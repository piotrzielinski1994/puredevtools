// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ui/toast";
import type { CookieGateway } from "../cookies/cookieGateway";
import { RulesProvider } from "../shared/RulesProvider";
import { createFakeGateway } from "../shared/test-gateway";
import { OptionsShell } from "./OptionsShell";

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    cookies: { getAll: vi.fn(async () => []), set: vi.fn(async () => null) },
  },
}));

const cookieGateway = (): CookieGateway => ({
  getAll: async () => ({ tree: [] }),
  save: async () => undefined,
  sync: async () => ({ copied: [], skipped: [] }),
});

const renderShell = () =>
  render(
    <RulesProvider gateway={createFakeGateway()}>
      <ToastProvider>
        <OptionsShell cookieGateway={cookieGateway()} />
      </ToastProvider>
    </RulesProvider>,
  );

describe("OptionsShell", () => {
  it("should show the rules workspace by default (TC-012)", async () => {
    renderShell();
    expect(
      await screen.findByRole("button", { name: /new rule/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no cookie mappings/i)).not.toBeInTheDocument();
  });

  it("should switch to the cookie sync view when the Cookie sync tab is clicked (TC-012)", async () => {
    renderShell();
    fireEvent.click(await screen.findByRole("tab", { name: /cookie sync/i }));
    await waitFor(() =>
      expect(screen.getByText(/no cookie mappings/i)).toBeInTheDocument(),
    );
  });

  it("should switch back to the rules workspace from the cookie sync view (TC-012)", async () => {
    renderShell();
    fireEvent.click(await screen.findByRole("tab", { name: /cookie sync/i }));
    await screen.findByText(/no cookie mappings/i);
    fireEvent.click(screen.getByRole("tab", { name: /^rules$/i }));
    await waitFor(() =>
      expect(screen.queryByText(/no cookie mappings/i)).not.toBeInTheDocument(),
    );
  });

  it("should render the section switcher inside the sidebar, above the search field (TC-012)", async () => {
    renderShell();
    const tablist = await screen.findByRole("tablist", { name: /section/i });
    const search = screen.getByLabelText(/search rules/i);
    expect(
      tablist.compareDocumentPosition(search) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("should render the chrome controls above the section switcher (TC-012)", async () => {
    renderShell();
    const chrome = await screen.findByRole("button", { name: /import rules/i });
    const tablist = screen.getByRole("tablist", { name: /section/i });
    expect(
      chrome.compareDocumentPosition(tablist) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("should keep the import/export/global/theme controls visible in the cookie sync view (TC-012)", async () => {
    renderShell();
    fireEvent.click(await screen.findByRole("tab", { name: /cookie sync/i }));
    await screen.findByText(/no cookie mappings/i);
    expect(
      screen.getByRole("button", { name: /import rules/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /export rules/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/global enabled/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /switch to (dark|light) theme/i }),
    ).toBeInTheDocument();
  });
});
