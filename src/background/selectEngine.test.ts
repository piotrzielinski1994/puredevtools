import { describe, it, expect } from 'vitest';
import type { Capabilities, RequestEngine } from '../engine/RequestEngine';
import type { EngineEnv } from './selectEngine';
import { selectEngine } from './selectEngine';

type MarkedEngine = RequestEngine & { marker: 'chrome' | 'firefox' };

const createMarkedEngine = (marker: 'chrome' | 'firefox'): MarkedEngine => ({
  marker,
  capabilities: (): Capabilities => ({ responseBodyRewrite: false, artificialLatency: false }),
  apply: async () => {},
  clear: async () => {},
});

const createEnv = (
  hasFilterResponseData: boolean,
): EngineEnv & { chromeEngine: MarkedEngine; firefoxEngine: MarkedEngine } => {
  const chromeEngine = createMarkedEngine('chrome');
  const firefoxEngine = createMarkedEngine('firefox');
  return {
    hasFilterResponseData,
    chromeEngine,
    firefoxEngine,
    chrome: () => chromeEngine,
    firefox: () => firefoxEngine,
  };
};

describe('selectEngine (AC-001)', () => {
  it('should return the firefox engine if hasFilterResponseData is true (TC-001)', () => {
    const env = createEnv(true);
    expect(selectEngine(env)).toBe(env.firefoxEngine);
  });

  it('should return the chrome engine if hasFilterResponseData is false (TC-002)', () => {
    const env = createEnv(false);
    expect(selectEngine(env)).toBe(env.chromeEngine);
  });

  it('should invoke the firefox thunk and not the chrome thunk when on firefox (AC-001)', () => {
    let chromeCalls = 0;
    let firefoxCalls = 0;
    const firefoxEngine = createMarkedEngine('firefox');
    const env: EngineEnv = {
      hasFilterResponseData: true,
      chrome: () => {
        chromeCalls += 1;
        return createMarkedEngine('chrome');
      },
      firefox: () => {
        firefoxCalls += 1;
        return firefoxEngine;
      },
    };
    const selected = selectEngine(env);
    expect(selected).toBe(firefoxEngine);
    expect(firefoxCalls).toBe(1);
    expect(chromeCalls).toBe(0);
  });

  it('should invoke the chrome thunk and not the firefox thunk when not on firefox (AC-001)', () => {
    let chromeCalls = 0;
    let firefoxCalls = 0;
    const chromeEngine = createMarkedEngine('chrome');
    const env: EngineEnv = {
      hasFilterResponseData: false,
      chrome: () => {
        chromeCalls += 1;
        return chromeEngine;
      },
      firefox: () => {
        firefoxCalls += 1;
        return createMarkedEngine('firefox');
      },
    };
    const selected = selectEngine(env);
    expect(selected).toBe(chromeEngine);
    expect(chromeCalls).toBe(1);
    expect(firefoxCalls).toBe(0);
  });

  it('should select firefox by the marker field when hasFilterResponseData is true (TC-001)', () => {
    const selected = selectEngine(createEnv(true)) as MarkedEngine;
    expect(selected.marker).toBe('firefox');
  });

  it('should select chrome by the marker field when hasFilterResponseData is false (TC-002)', () => {
    const selected = selectEngine(createEnv(false)) as MarkedEngine;
    expect(selected.marker).toBe('chrome');
  });
});
