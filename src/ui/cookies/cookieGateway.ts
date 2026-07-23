import type {
  CookieMapping,
  CookieSyncState,
  SyncResult,
} from "../../cookies/model";

export type CookieGateway = {
  getAll(): Promise<CookieSyncState>;
  save(state: CookieSyncState): Promise<void>;
  sync(mapping: CookieMapping): Promise<SyncResult>;
};
