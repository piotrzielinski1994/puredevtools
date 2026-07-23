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

const parseBody = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

const serializeBody = (body: unknown): string =>
  typeof body === "string" ? body : JSON.stringify(body);

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
  setHeader: (name: string, value: string): void =>
    req.headers.set(name, value),
  removeHeader: (name: string): void => req.headers.delete(name),
  getHeaders: (): Record<string, string> => headersToRecord(req.headers),
  getBody: (): unknown => parseBody(req.body ?? ""),
  setBody: (body: unknown): void => {
    req.body = serializeBody(body);
  },
});

export const createResponseFacade = (res: MutableResponse) => ({
  getStatus: (): number => res.status,
  getHeader: (name: string): string | null => res.headers.get(name),
  setHeader: (name: string, value: string): void =>
    res.headers.set(name, value),
  removeHeader: (name: string): void => res.headers.delete(name),
  getHeaders: (): Record<string, string> => headersToRecord(res.headers),
  getBody: (): unknown => parseBody(res.body),
  setBody: (body: unknown): void => {
    res.body = serializeBody(body);
  },
  getJson: (): unknown => {
    try {
      return JSON.parse(res.body);
    } catch {
      return undefined;
    }
  },
});

const CONSOLE_PREFIX = "[puredevtools script]";

export const createConsoleFacade = (sink: (...args: unknown[]) => void) => ({
  log: (...args: unknown[]): void => sink(CONSOLE_PREFIX, ...args),
  info: (...args: unknown[]): void => sink(CONSOLE_PREFIX, ...args),
  warn: (...args: unknown[]): void => sink(CONSOLE_PREFIX, ...args),
  error: (...args: unknown[]): void => sink(CONSOLE_PREFIX, ...args),
});
