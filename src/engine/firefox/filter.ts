import type { StreamFilter } from './types';

export const attachBodyRewrite = (
  filter: StreamFilter,
  replacement: string,
  latencyMs?: number,
  delay?: (ms: number) => Promise<void>,
): void => {
  filter.ondata = () => undefined;
  const flush = () => {
    filter.write(new TextEncoder().encode(replacement));
    filter.disconnect();
  };
  filter.onstop = () => {
    if (latencyMs && delay) {
      void delay(latencyMs).then(flush);
      return;
    }
    flush();
  };
};
