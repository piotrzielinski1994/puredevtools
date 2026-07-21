import type { Cookies } from 'webextension-polyfill';

export type CookieMapping = {
  id: string;
  name: string;
  enabled: boolean;
  sourceUrl: string;
  targetUrl: string;
  cookieNames: string[];
};

export type CookieMappingNode = { kind: 'mapping'; mapping: CookieMapping };

export type CookieFolderNode = {
  kind: 'folder';
  id: string;
  name: string;
  collapsed: boolean;
  children: CookieTreeNode[];
};

export type CookieTreeNode = CookieMappingNode | CookieFolderNode;

export type CookieSyncState = {
  tree: CookieTreeNode[];
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
