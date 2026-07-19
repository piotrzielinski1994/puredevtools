export type MutableRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
};

export type MutableResponse = {
  readonly status: number;
  headers: Headers;
  body: string;
};

const headersToRecord = (headers: Headers): Record<string, string> => {
  const record: Record<string, string> = {};
  headers.forEach((value, name) => {
    record[name] = value;
  });
  return record;
};

export type RequestFacade = ReturnType<typeof createRequestFacade>;
export type ResponseFacade = ReturnType<typeof createResponseFacade>;
export type ConsoleFacade = ReturnType<typeof createConsoleFacade>;

export const createRequestFacade = (req: MutableRequest) => ({
  getUrl: (): string => req.url,
  setUrl: (url: string): void => {
    req.url = url;
  },
  getMethod: (): string => req.method,
  setMethod: (method: string): void => {
    req.method = method;
  },
  getHeader: (name: string): string | null => req.headers.get(name),
  setHeader: (name: string, value: string): void => req.headers.set(name, value),
  removeHeader: (name: string): void => req.headers.delete(name),
  getHeaders: (): Record<string, string> => headersToRecord(req.headers),
  getBody: (): string => req.body ?? '',
  setBody: (body: string): void => {
    req.body = body;
  },
});

export const createResponseFacade = (res: MutableResponse) => ({
  getStatus: (): number => res.status,
  getHeader: (name: string): string | null => res.headers.get(name),
  setHeader: (name: string, value: string): void => res.headers.set(name, value),
  removeHeader: (name: string): void => res.headers.delete(name),
  getHeaders: (): Record<string, string> => headersToRecord(res.headers),
  getBody: (): string => res.body,
  setBody: (body: string): void => {
    res.body = body;
  },
  getJson: (): unknown => {
    try {
      return JSON.parse(res.body);
    } catch {
      return undefined;
    }
  },
});

const CONSOLE_PREFIX = '[puredevtools script]';

export const createConsoleFacade = (sink: (...args: unknown[]) => void) => ({
  log: (...args: unknown[]): void => sink(CONSOLE_PREFIX, ...args),
  info: (...args: unknown[]): void => sink(CONSOLE_PREFIX, ...args),
  warn: (...args: unknown[]): void => sink(CONSOLE_PREFIX, ...args),
  error: (...args: unknown[]): void => sink(CONSOLE_PREFIX, ...args),
});
