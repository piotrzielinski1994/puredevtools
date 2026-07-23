// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

const Trigger = ({
  message,
  variant,
}: {
  message: string;
  variant?: "success" | "error";
}) => {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(message, variant)}>
      go
    </button>
  );
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ToastProvider", () => {
  it("should render the message inside an aria-live region if show is called", () => {
    // behavior: show surfaces the message inside an aria-live region
    render(
      <ToastProvider>
        <Trigger message="Rules imported." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "go" }));

    const message = screen.getByText("Rules imported.");
    expect(message).toBeInTheDocument();
    expect(message.closest("[aria-live]")).not.toBeNull();
  });

  it("should clear the message if the dismiss timeout elapses", () => {
    // behavior: toast auto-dismisses after its timeout
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="Rules imported." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByText("Rules imported.")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText("Rules imported.")).not.toBeInTheDocument();
  });

  it("should apply the text-destructive class if the error variant is used", () => {
    // behavior: error variant styling
    render(
      <ToastProvider>
        <Trigger message="Import failed: boom" variant="error" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "go" }));

    expect(
      screen.getByText("Import failed: boom").closest(".text-destructive"),
    ).not.toBeNull();
  });

  it("should apply the text-emerald-600 class if the success variant is used", () => {
    // behavior: success variant styling
    render(
      <ToastProvider>
        <Trigger message="Rules imported." variant="success" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "go" }));

    expect(
      screen.getByText("Rules imported.").closest(".text-emerald-600"),
    ).not.toBeNull();
  });

  it("should not throw if useToast is used without a provider", () => {
    // behavior: unwrapped useToast returns a no-op show
    render(<Trigger message="Rules imported." />);

    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "go" })),
    ).not.toThrow();
    expect(screen.queryByText("Rules imported.")).not.toBeInTheDocument();
  });
});
