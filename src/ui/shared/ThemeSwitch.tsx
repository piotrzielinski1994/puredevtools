import { Moon, Sun } from "lucide-react";
import type { Theme } from "./theme";

export type ThemeSwitchProps = {
  theme: Theme;
  onChange(theme: Theme): void;
};

export const ThemeSwitch = ({ theme, onChange }: ThemeSwitchProps) => {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="text-muted-foreground hover:text-foreground"
      onClick={() => onChange(isDark ? "light" : "dark")}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
};
