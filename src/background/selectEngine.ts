import type { RequestEngine } from '../engine/RequestEngine';

export type EngineEnv = {
  hasFilterResponseData: boolean;
  chrome: () => RequestEngine;
  firefox: () => RequestEngine;
};

export const selectEngine = (env: EngineEnv): RequestEngine =>
  env.hasFilterResponseData ? env.firefox() : env.chrome();
