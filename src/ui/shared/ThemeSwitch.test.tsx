// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeSwitch } from "./ThemeSwitch";

describe("ThemeSwitch", () => {
  it("should offer switching to light when the current theme is dark", () => {
    render(<ThemeSwitch theme="dark" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });

  it("should offer switching to dark when the current theme is light", () => {
    render(<ThemeSwitch theme="light" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /switch to dark theme/i }),
    ).toBeInTheDocument();
  });

  it("should call onChange with dark when clicked from light", () => {
    const onChange = vi.fn();
    render(<ThemeSwitch theme="light" onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", { name: /switch to dark theme/i }),
    );
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("should call onChange with light when clicked from dark", () => {
    const onChange = vi.fn();
    render(<ThemeSwitch theme="dark" onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", { name: /switch to light theme/i }),
    );
    expect(onChange).toHaveBeenCalledWith("light");
  });
});
