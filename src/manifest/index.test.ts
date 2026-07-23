import { describe, expect, it } from "vitest";
import { buildManifest } from "./index";

describe("buildManifest", () => {
  it("should produce an MV3 manifest with a service worker for chrome", () => {
    const manifest = buildManifest("chrome");
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toHaveProperty("service_worker");
    expect(manifest.background).not.toHaveProperty("scripts");
  });

  it("should produce a scripts-based background and gecko settings for firefox", () => {
    const manifest = buildManifest("firefox");
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toHaveProperty("scripts");
    expect(manifest.background).not.toHaveProperty("service_worker");
    expect(manifest.browser_specific_settings?.gecko.id).toBeTruthy();
  });

  it("should share name, version and description across targets", () => {
    const chrome = buildManifest("chrome");
    const firefox = buildManifest("firefox");
    expect(chrome.name).toBe(firefox.name);
    expect(chrome.version).toBe(firefox.version);
    expect(chrome.description).toBe(firefox.description);
  });

  it("should request the storage and cookies permissions on both engines (TC-001)", () => {
    expect(buildManifest("chrome").permissions).toEqual(["storage", "cookies"]);
    expect(buildManifest("firefox").permissions).toEqual([
      "storage",
      "cookies",
    ]);
  });

  it("should keep host_permissions at all_urls on both engines (TC-001)", () => {
    expect(buildManifest("chrome").host_permissions).toEqual(["<all_urls>"]);
    expect(buildManifest("firefox").host_permissions).toEqual(["<all_urls>"]);
  });

  it("should not add gecko settings to the chrome manifest", () => {
    expect(buildManifest("chrome").browser_specific_settings).toBeUndefined();
  });

  it("should register a MAIN-world page patch and an ISOLATED bridge content script at document_start", () => {
    const scripts = buildManifest("chrome").content_scripts;
    const main = scripts.find((script) => script.world === "MAIN");
    const isolated = scripts.find((script) => script.world === "ISOLATED");
    expect(main?.run_at).toBe("document_start");
    expect(main?.js).toContain("src/content/page-main.ts");
    expect(isolated?.run_at).toBe("document_start");
    expect(isolated?.js).toContain("src/content/bridge.ts");
  });

  it("should declare a devtools_page on both targets", () => {
    expect(buildManifest("chrome").devtools_page).toBe(
      "src/devtools/devtools.html",
    );
    expect(buildManifest("firefox").devtools_page).toBe(
      "src/devtools/devtools.html",
    );
  });
});
