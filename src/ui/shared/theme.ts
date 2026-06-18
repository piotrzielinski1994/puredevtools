export type Theme = 'light' | 'dark';

export const DEFAULT_THEME: Theme = 'light';

export const normalizeTheme = (value: unknown): Theme => (value === 'dark' ? 'dark' : 'light');

export const applyTheme = (theme: Theme, root: HTMLElement): void => {
  root.classList.toggle('dark', theme === 'dark');
};
