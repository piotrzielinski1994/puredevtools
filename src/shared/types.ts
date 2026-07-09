export type Target = 'chrome' | 'firefox';

export const isTarget = (value: string): value is Target =>
  value === 'chrome' || value === 'firefox';
