import { Moon, Sun } from 'lucide-react';
import { Switch } from '../components/ui/switch';
import type { Theme } from './theme';

export type ThemeSwitchProps = {
  theme: Theme;
  onChange(theme: Theme): void;
};

export const ThemeSwitch = ({ theme, onChange }: ThemeSwitchProps) => {
  const isDark = theme === 'dark';
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      <Switch
        aria-label="Dark mode"
        checked={isDark}
        onChange={() => onChange(isDark ? 'light' : 'dark')}
      />
    </label>
  );
};
