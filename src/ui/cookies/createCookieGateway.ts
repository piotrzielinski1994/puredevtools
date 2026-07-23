import browser from "webextension-polyfill";
import type { CookieApiPort } from "../../cookies/model";
import { CookieSyncRepository } from "../../cookies/storage";
import { syncMapping } from "../../cookies/sync";
import type { CookieGateway } from "./cookieGateway";

export const createCookieGateway = (): CookieGateway => {
  const repository = new CookieSyncRepository(browser.storage.local);
  const port: CookieApiPort = {
    getAll: (details) => browser.cookies.getAll(details),
    set: (details) => browser.cookies.set(details),
  };

  return {
    getAll: () => repository.getAll(),
    save: (state) => repository.save(state),
    sync: (mapping) => syncMapping(mapping, port),
  };
};
