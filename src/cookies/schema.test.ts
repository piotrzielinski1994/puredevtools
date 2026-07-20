import { describe, it, expect } from 'vitest';
import { cookieMappingSchema, cookieSyncStateSchema } from './schema';

const validMapping = {
  id: 'cm1',
  name: 'prod auth -> localhost',
  enabled: true,
  sourceUrl: 'https://app.prod.com',
  targetUrl: 'http://localhost:3000',
  cookieNames: ['auth', 'sid'],
};

describe('cookieMappingSchema', () => {
  it('should parse a valid cookie mapping (TC-002)', () => {
    expect(cookieMappingSchema.safeParse(validMapping).success).toBe(true);
  });

  it('should reject a cookie mapping carrying an unknown key (TC-002, strict)', () => {
    const mapping = { ...validMapping, resourceTypes: ['xhr'] };
    expect(cookieMappingSchema.safeParse(mapping).success).toBe(false);
  });

  it('should reject a mapping missing its cookieNames array (TC-002)', () => {
    const { cookieNames, ...rest } = validMapping;
    void cookieNames;
    expect(cookieMappingSchema.safeParse(rest).success).toBe(false);
  });

  it('should parse a mapping with an empty cookieNames array (TC-002)', () => {
    expect(cookieMappingSchema.safeParse({ ...validMapping, cookieNames: [] }).success).toBe(true);
  });
});

describe('cookieSyncStateSchema', () => {
  it('should parse a state carrying an array of mappings (TC-002)', () => {
    const state = { mappings: [validMapping, { ...validMapping, id: 'cm2' }] };
    expect(cookieSyncStateSchema.safeParse(state).success).toBe(true);
  });

  it('should parse an empty state', () => {
    expect(cookieSyncStateSchema.safeParse({ mappings: [] }).success).toBe(true);
  });

  it('should reject a state missing its mappings array', () => {
    expect(cookieSyncStateSchema.safeParse({}).success).toBe(false);
  });

  it('should reject a state carrying an unknown key (strict)', () => {
    expect(cookieSyncStateSchema.safeParse({ mappings: [], foo: 1 }).success).toBe(false);
  });
});
