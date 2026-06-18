import { describe, it, expect } from 'vitest';
import type { StreamFilter } from './types';
import { attachBodyRewrite } from './filter';

const createFakeFilter = (): StreamFilter & {
  writes: Uint8Array[];
  disconnectCount: number;
  closeCount: number;
} => {
  const writes: Uint8Array[] = [];
  return {
    ondata: null,
    onstop: null,
    writes,
    disconnectCount: 0,
    closeCount: 0,
    write(data: Uint8Array) {
      writes.push(data);
    },
    disconnect() {
      this.disconnectCount += 1;
    },
    close() {
      this.closeCount += 1;
    },
  };
};

const encode = (text: string): ArrayBuffer => {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('attachBodyRewrite (AC-006, TC-007)', () => {
  it('should set the ondata handler on the filter', () => {
    const filter = createFakeFilter();
    attachBodyRewrite(filter, 'replacement');
    expect(filter.ondata).toBeTypeOf('function');
  });

  it('should set the onstop handler on the filter', () => {
    const filter = createFakeFilter();
    attachBodyRewrite(filter, 'replacement');
    expect(filter.onstop).toBeTypeOf('function');
  });

  it('should write the replacement decoded to the original string on stop', () => {
    const filter = createFakeFilter();
    attachBodyRewrite(filter, '{"replaced":true}');
    filter.ondata?.({ data: encode('{"original":true}') });
    filter.onstop?.();
    const written = filter.writes.map(decode).join('');
    expect(written).toBe('{"replaced":true}');
  });

  it('should close the filter after writing the replacement so the original body is suppressed', () => {
    const filter = createFakeFilter();
    attachBodyRewrite(filter, 'replacement');
    filter.onstop?.();
    expect(filter.closeCount).toBe(1);
    expect(filter.disconnectCount).toBe(0);
  });

  it('should discard the original body chunks so the response is fully replaced', () => {
    const filter = createFakeFilter();
    attachBodyRewrite(filter, 'NEW');
    filter.ondata?.({ data: encode('OLD-PART-1') });
    filter.ondata?.({ data: encode('OLD-PART-2') });
    filter.onstop?.();
    const written = filter.writes.map(decode).join('');
    expect(written).toBe('NEW');
    expect(written).not.toContain('OLD');
  });

  it('should write the replacement even when no ondata chunk was received', () => {
    const filter = createFakeFilter();
    attachBodyRewrite(filter, 'EMPTY-BODY-CASE');
    filter.onstop?.();
    expect(filter.writes.map(decode).join('')).toBe('EMPTY-BODY-CASE');
  });

  it('should delay the write by latencyMs when a delay function is provided', async () => {
    const filter = createFakeFilter();
    const delays: number[] = [];
    attachBodyRewrite(filter, 'LATE', 200, async (ms) => {
      delays.push(ms);
    });
    filter.onstop?.();
    expect(filter.writes).toHaveLength(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(delays).toEqual([200]);
    expect(filter.writes.map(decode).join('')).toBe('LATE');
    expect(filter.closeCount).toBe(1);
  });
});
