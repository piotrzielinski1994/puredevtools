import { describe, it, expect } from 'vitest';
import { buildManifest } from './index';

describe('buildManifest', () => {
  it('should produce an MV3 manifest with a service worker for chrome', () => {
    const manifest = buildManifest('chrome');
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toHaveProperty('service_worker');
    expect(manifest.background).not.toHaveProperty('scripts');
  });

  it('should produce a scripts-based background and gecko settings for firefox', () => {
    const manifest = buildManifest('firefox');
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toHaveProperty('scripts');
    expect(manifest.background).not.toHaveProperty('service_worker');
    expect(manifest.browser_specific_settings?.gecko.id).toBeTruthy();
  });

  it('should share name, version and description across targets', () => {
    const chrome = buildManifest('chrome');
    const firefox = buildManifest('firefox');
    expect(chrome.name).toBe(firefox.name);
    expect(chrome.version).toBe(firefox.version);
    expect(chrome.description).toBe(firefox.description);
  });

  it('should request DNR permissions on chrome and webRequest permissions on firefox', () => {
    expect(buildManifest('chrome').permissions).toContain('declarativeNetRequest');
    expect(buildManifest('firefox').permissions).toContain('webRequest');
  });

  it('should not add gecko settings to the chrome manifest', () => {
    expect(buildManifest('chrome').browser_specific_settings).toBeUndefined();
  });
});
