// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  createRequestFacade,
  createResponseFacade,
  createConsoleFacade,
  type MutableRequest,
  type MutableResponse,
} from './facades';

const mutableRequest = (overrides: Partial<MutableRequest> = {}): MutableRequest => ({
  url: 'https://api.x/users',
  method: 'GET',
  headers: new Headers(),
  body: undefined,
  ...overrides,
});

const mutableResponse = (overrides: Partial<MutableResponse> = {}): MutableResponse => ({
  status: 200,
  headers: new Headers(),
  body: '',
  ...overrides,
});

describe('createRequestFacade (AC-004)', () => {
  it('should read the underlying url and method through the getters', () => {
    // behavior: getters project the current MutableRequest state
    const facade = createRequestFacade(mutableRequest({ url: 'https://api.x/y', method: 'POST' }));

    expect(facade.getUrl()).toBe('https://api.x/y');
    expect(facade.getMethod()).toBe('POST');
  });

  it('should reflect a prior setUrl in a later getUrl within the same run (AC-004)', () => {
    // behavior: a getter reads back what a setter wrote earlier in the run
    const facade = createRequestFacade(mutableRequest());

    facade.setUrl('https://api.x/changed');

    expect(facade.getUrl()).toBe('https://api.x/changed');
  });

  it('should reflect a prior setMethod in a later getMethod', () => {
    const facade = createRequestFacade(mutableRequest());

    facade.setMethod('DELETE');

    expect(facade.getMethod()).toBe('DELETE');
  });

  it('should write url and method mutations back to the underlying MutableRequest (AC-004)', () => {
    // side-effect-contract: after the run the host reads the mutated request
    const req = mutableRequest();
    const facade = createRequestFacade(req);

    facade.setUrl('https://api.x/v2');
    facade.setMethod('PUT');

    expect(req.url).toBe('https://api.x/v2');
    expect(req.method).toBe('PUT');
  });

  it('should read a header case-insensitively (AC-004)', () => {
    // behavior: getHeader ignores case per the HTTP header contract
    const facade = createRequestFacade(mutableRequest({ headers: new Headers({ 'X-Env': 'staging' }) }));

    expect(facade.getHeader('x-env')).toBe('staging');
    expect(facade.getHeader('X-ENV')).toBe('staging');
  });

  it('should return null from getHeader for an absent header', () => {
    const facade = createRequestFacade(mutableRequest());

    expect(facade.getHeader('x-missing')).toBeNull();
  });

  it('should set a header that a later getHeader reads back and that lands on the underlying headers', () => {
    // behavior + side-effect-contract: setHeader is visible in-run and on the MutableRequest
    const req = mutableRequest();
    const facade = createRequestFacade(req);

    facade.setHeader('X-Token', 'abc');

    expect(facade.getHeader('x-token')).toBe('abc');
    expect(req.headers.get('x-token')).toBe('abc');
  });

  it('should remove a header so a later getHeader returns null', () => {
    const req = mutableRequest({ headers: new Headers({ 'X-Secret': 'shh' }) });
    const facade = createRequestFacade(req);

    facade.removeHeader('x-secret');

    expect(facade.getHeader('x-secret')).toBeNull();
    expect(req.headers.get('x-secret')).toBeNull();
  });

  it('should return all headers as a plain record', () => {
    // behavior: getHeaders snapshots the headers into a Record
    const facade = createRequestFacade(mutableRequest({ headers: new Headers({ 'X-A': '1', 'X-B': '2' }) }));

    expect(facade.getHeaders()).toMatchObject({ 'x-a': '1', 'x-b': '2' });
  });

  it('should return an empty string from getBody when the body is undefined (AC-004)', () => {
    // behavior: getBody normalizes a missing body to ''
    const facade = createRequestFacade(mutableRequest({ body: undefined }));

    expect(facade.getBody()).toBe('');
  });

  it('should read back a set body and write it to the underlying MutableRequest', () => {
    // behavior + side-effect-contract: setBody is visible in-run and persisted
    const req = mutableRequest();
    const facade = createRequestFacade(req);

    facade.setBody('{"q":2}');

    expect(facade.getBody()).toBe('{"q":2}');
    expect(req.body).toBe('{"q":2}');
  });
});

describe('createResponseFacade (AC-005)', () => {
  it('should read the status through getStatus', () => {
    // behavior: getStatus returns the underlying status
    const facade = createResponseFacade(mutableResponse({ status: 503 }));

    expect(facade.getStatus()).toBe(503);
  });

  it('should not expose a setStatus member (status is read-only) (AC-005)', () => {
    // behavior: the response facade deliberately omits any status setter
    const facade = createResponseFacade(mutableResponse());

    expect('setStatus' in facade).toBe(false);
    expect((facade as Record<string, unknown>).setStatus).toBeUndefined();
  });

  it('should read a response header case-insensitively', () => {
    const facade = createResponseFacade(mutableResponse({ headers: new Headers({ 'Content-Type': 'application/json' }) }));

    expect(facade.getHeader('content-type')).toBe('application/json');
  });

  it('should set and remove response headers, readable back and on the underlying response', () => {
    // behavior + side-effect-contract: header mutations land on the MutableResponse
    const res = mutableResponse({ headers: new Headers({ 'Set-Cookie': 'sid=1' }) });
    const facade = createResponseFacade(res);

    facade.setHeader('X-Test', 'on');
    facade.removeHeader('set-cookie');

    expect(facade.getHeader('x-test')).toBe('on');
    expect(res.headers.get('x-test')).toBe('on');
    expect(facade.getHeader('set-cookie')).toBeNull();
  });

  it('should return all response headers as a plain record', () => {
    const facade = createResponseFacade(mutableResponse({ headers: new Headers({ 'X-A': '1' }) }));

    expect(facade.getHeaders()).toMatchObject({ 'x-a': '1' });
  });

  it('should read the body and read back a set body, writing it to the underlying response', () => {
    // behavior + side-effect-contract: setBody is visible in-run and persisted
    const res = mutableResponse({ body: 'orig' });
    const facade = createResponseFacade(res);

    expect(facade.getBody()).toBe('orig');
    facade.setBody('changed');
    expect(facade.getBody()).toBe('changed');
    expect(res.body).toBe('changed');
  });

  it('should parse the body as JSON via getJson (AC-005)', () => {
    // behavior: getJson returns JSON.parse of the current body
    const facade = createResponseFacade(mutableResponse({ body: '{"id":42,"ok":true}' }));

    expect(facade.getJson()).toEqual({ id: 42, ok: true });
  });

  it('should reflect a setBody in a subsequent getJson', () => {
    // behavior: getJson reads the live body, so it sees a script's setBody
    const facade = createResponseFacade(mutableResponse({ body: '{"a":1}' }));

    facade.setBody('{"a":2}');

    expect(facade.getJson()).toEqual({ a: 2 });
  });

  it('should return undefined (not throw) from getJson on a non-JSON body (AC-005)', () => {
    // behavior: a parse failure degrades to undefined
    const facade = createResponseFacade(mutableResponse({ body: 'not json <html>' }));

    expect(() => facade.getJson()).not.toThrow();
    expect(facade.getJson()).toBeUndefined();
  });
});

describe('createConsoleFacade (AC-011)', () => {
  it('should forward log args to the sink with the puredevtools script prefix', () => {
    // side-effect-contract: log is routed to the injected sink, prefixed for identification
    const sink = vi.fn();
    const facade = createConsoleFacade(sink);

    facade.log('hello', 123);

    expect(sink).toHaveBeenCalledTimes(1);
    const args = sink.mock.calls[0];
    expect(args.some((a) => typeof a === 'string' && a.includes('[puredevtools script]'))).toBe(true);
    expect(args).toContain('hello');
    expect(args).toContain(123);
  });

  it('should forward info/warn/error to the sink with the prefix', () => {
    // side-effect-contract: every console level reaches the sink prefixed
    const sink = vi.fn();
    const facade = createConsoleFacade(sink);

    facade.info('i');
    facade.warn('w');
    facade.error('e');

    expect(sink).toHaveBeenCalledTimes(3);
    sink.mock.calls.forEach((callArgs) => {
      expect(callArgs.some((a) => typeof a === 'string' && a.includes('[puredevtools script]'))).toBe(true);
    });
  });

  it('should expose exactly the log/info/warn/error members', () => {
    // behavior: the console facade shape matches the documented API
    const facade = createConsoleFacade(vi.fn());

    expect(typeof facade.log).toBe('function');
    expect(typeof facade.info).toBe('function');
    expect(typeof facade.warn).toBe('function');
    expect(typeof facade.error).toBe('function');
  });
});
