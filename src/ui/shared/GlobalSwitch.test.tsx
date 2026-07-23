import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlobalSwitch } from "./GlobalSwitch";
import type { UiGateway } from "./gateway";
import { RulesProvider } from "./RulesProvider";
import { createFakeGateway as createBaseGateway } from "./test-gateway";

const createFakeGateway = (globalEnabled: boolean) =>
  createBaseGateway([], globalEnabled);

const renderSwitch = (gateway: UiGateway) =>
  render(
    <RulesProvider gateway={gateway}>
      <GlobalSwitch />
    </RulesProvider>,
  );

describe("GlobalSwitch", () => {
  it("should reflect globalEnabled=true from context as a checked switch (AC-008)", async () => {
    const gateway = createFakeGateway(true);
    renderSwitch(gateway);

    const toggle = await screen.findByRole("switch");
    expect(toggle).toBeChecked();
  });

  it("should reflect globalEnabled=false from context as an unchecked switch (AC-008)", async () => {
    const gateway = createFakeGateway(false);
    renderSwitch(gateway);

    const toggle = await screen.findByRole("switch");
    expect(toggle).not.toBeChecked();
  });

  it("should call gateway.setGlobalEnabled with the new value when toggled (AC-008)", async () => {
    const gateway = createFakeGateway(true);
    renderSwitch(gateway);

    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(gateway.setGlobalEnabled).toHaveBeenCalledTimes(1),
    );
    expect(gateway.setGlobalEnabled).toHaveBeenCalledWith(false);
  });
});
