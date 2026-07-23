// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloseConfirmDialog } from "./CloseConfirmDialog";

const renderDialog = (
  overrides: Partial<React.ComponentProps<typeof CloseConfirmDialog>> = {},
) => {
  const props = {
    open: true,
    ruleLabel: "alpha rule",
    canSave: true,
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<CloseConfirmDialog {...props} />);
  return props;
};

describe("CloseConfirmDialog", () => {
  it("should show the Unsaved changes heading and a body naming the rule if open", () => {
    // behavior: the dialog titles itself and names the affected rule
    renderDialog({ ruleLabel: "alpha rule" });

    expect(
      screen.getByRole("heading", { name: /unsaved changes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/alpha rule/)).toBeInTheDocument();
  });

  it("should call onSave if the Save button is clicked when canSave is true", () => {
    // side-effect-contract: an enabled Save fires onSave
    const props = renderDialog({ canSave: true });

    const save = screen.getByRole("button", { name: /save/i });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);

    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("should call onDiscard if the Discard button is clicked", () => {
    // side-effect-contract: Discard fires onDiscard
    const props = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(props.onDiscard).toHaveBeenCalledTimes(1);
  });

  it("should call onCancel if the Cancel button is clicked", () => {
    // side-effect-contract: Cancel fires onCancel
    const props = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("should disable Save and show a URL-pattern hint if canSave is false", () => {
    // behavior: an invalid draft blocks Save and explains why
    renderDialog({ canSave: false });

    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(screen.getByText(/url pattern/i)).toBeInTheDocument();
  });

  it("should still allow Discard and Cancel if canSave is false", () => {
    // side-effect-contract: the invalid-draft exits (Discard/Cancel) stay live
    const props = renderDialog({ canSave: false });

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onDiscard).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("should render nothing if open is false", () => {
    // behavior: a closed confirm dialog is absent from the tree
    renderDialog({ open: false });

    expect(
      screen.queryByRole("heading", { name: /unsaved changes/i }),
    ).not.toBeInTheDocument();
  });
});
