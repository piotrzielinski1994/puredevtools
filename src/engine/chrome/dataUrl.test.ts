import { describe, it, expect } from 'vitest';
import type { MockResponse } from './dataUrl';
import { encodeDataUrl } from './dataUrl';

const buildMock = (overrides: Partial<MockResponse> = {}): MockResponse => ({
  status: 200,
  body: '{"message":"hello"}',
  contentType: 'application/json',
  ...overrides,
});

const decodeBody = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(',');
  const payload = dataUrl.slice(comma + 1);
  const isBase64 = dataUrl.slice(0, comma).includes(';base64');
  if (isBase64) {
    return atob(payload);
  }
  return decodeURIComponent(payload);
};

describe('encodeDataUrl', () => {
  it('should return a string that starts with the data: scheme', () => {
    expect(encodeDataUrl(buildMock())).toMatch(/^data:/);
  });

  it('should encode the body so it is recoverable from the data url', () => {
    const body = '{"message":"hello"}';
    const url = encodeDataUrl(buildMock({ body }));
    expect(decodeBody(url)).toContain('hello');
  });

  it('should reflect the provided content type in the data url', () => {
    const url = encodeDataUrl(buildMock({ contentType: 'application/json' }));
    expect(url).toContain('application/json');
  });

  it('should still produce a data: url when no content type is provided', () => {
    const url = encodeDataUrl(buildMock({ contentType: undefined }));
    expect(url).toMatch(/^data:/);
  });

  it('should encode an empty body without throwing', () => {
    expect(() => encodeDataUrl(buildMock({ body: '' }))).not.toThrow();
    expect(encodeDataUrl(buildMock({ body: '' }))).toMatch(/^data:/);
  });

  it('should preserve a body that contains special url characters', () => {
    const body = 'a=1&b=2 c/d?e#f';
    const url = encodeDataUrl(buildMock({ body, contentType: 'text/plain' }));
    expect(decodeBody(url)).toBe(body);
  });
});
