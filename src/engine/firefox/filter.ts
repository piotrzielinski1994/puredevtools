import type { StreamFilter } from './types';

export const attachBodyRewrite = (filter: StreamFilter, replacement: string): void => {
  filter.ondata = () => undefined;
  filter.onstop = () => {
    filter.write(new TextEncoder().encode(replacement));
    filter.disconnect();
  };
};
