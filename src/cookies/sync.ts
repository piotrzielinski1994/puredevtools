import type { Cookies } from "webextension-polyfill";
import type { CookieApiPort, CookieMapping, SyncResult } from "./model";

const isSecureTarget = (targetUrl: string): boolean => {
  try {
    return new URL(targetUrl).protocol === "https:";
  } catch {
    return false;
  }
};

const secureFor = (cookie: Cookies.Cookie, secureTarget: boolean): boolean =>
  secureTarget ? cookie.secure : false;

const sameSiteFor = (
  cookie: Cookies.Cookie,
  secure: boolean,
): Cookies.SameSiteStatus =>
  !secure && cookie.sameSite === "no_restriction" ? "lax" : cookie.sameSite;

const toSetDetails = (
  cookie: Cookies.Cookie,
  targetUrl: string,
  secureTarget: boolean,
): Cookies.SetDetailsType => {
  const secure = secureFor(cookie, secureTarget);
  return {
    url: targetUrl,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    sameSite: sameSiteFor(cookie, secure),
    secure,
    ...(cookie.expirationDate === undefined
      ? {}
      : { expirationDate: cookie.expirationDate }),
  };
};

export const syncMapping = async (
  mapping: CookieMapping,
  port: CookieApiPort,
): Promise<SyncResult> => {
  const copied: string[] = [];
  const skipped: SyncResult["skipped"] = [];

  const source = await port.getAll({ url: mapping.sourceUrl });
  const secureTarget = isSecureTarget(mapping.targetUrl);

  const results = await Promise.all(
    mapping.cookieNames.map(async (name) => {
      const matches = source.filter((cookie) => cookie.name === name);
      if (matches.length === 0) {
        return {
          name,
          outcomes: [{ ok: false as const, reason: "not-found" as const }],
        };
      }
      const outcomes = await Promise.all(
        matches.map(async (cookie) => {
          try {
            const set = await port.set(
              toSetDetails(cookie, mapping.targetUrl, secureTarget),
            );
            return set === null
              ? { ok: false as const, reason: "set-rejected" as const }
              : { ok: true as const };
          } catch {
            return { ok: false as const, reason: "set-rejected" as const };
          }
        }),
      );
      return { name, outcomes };
    }),
  );

  results.forEach(({ name, outcomes }) => {
    outcomes.forEach((outcome) => {
      if (outcome.ok) {
        copied.push(name);
        return;
      }
      skipped.push({ name, reason: outcome.reason });
    });
  });

  return { copied, skipped };
};
