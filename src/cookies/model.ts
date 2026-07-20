import type { Cookies } from 'webextension-polyfill';

export type CookieMapping = {
  id: string;
  name: string;
  enabled: boolean;
  sourceUrl: string;
  targetUrl: string;
  cookieNames: string[];
};

export type CookieSyncState = {
  mappings: CookieMapping[];
};

export type SkipReason = 'not-found' | 'set-rejected';

export type SyncResult = {
  copied: string[];
  skipped: { name: string; reason: SkipReason }[];
};

export type CookieApiPort = {
  getAll(details: Cookies.GetAllDetailsType): Promise<Cookies.Cookie[]>;
  set(details: Cookies.SetDetailsType): Promise<Cookies.Cookie | null>;
};
