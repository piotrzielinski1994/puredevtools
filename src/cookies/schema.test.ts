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

const mappingNode = (over: Record<string, unknown> = {}) => ({ kind: 'mapping', mapping: { ...validMapping, ...over } });
const folderNode = (children: unknown[] = []) => ({
  kind: 'folder',
  id: 'folder-1',
  name: 'env',
  collapsed: false,
  children,
});

describe('cookieSyncStateSchema', () => {
  it('should parse a state carrying a tree of mapping nodes (TC-003)', () => {
    const state = { tree: [mappingNode(), mappingNode({ id: 'cm2' })] };
    expect(cookieSyncStateSchema.safeParse(state).success).toBe(true);
  });

  it('should parse a nested folder tree to arbitrary depth (TC-003)', () => {
    const state = { tree: [folderNode([folderNode([mappingNode()])])] };
    expect(cookieSyncStateSchema.safeParse(state).success).toBe(true);
  });

  it('should parse an empty tree', () => {
    expect(cookieSyncStateSchema.safeParse({ tree: [] }).success).toBe(true);
  });

  it('should reject a state missing its tree array', () => {
    expect(cookieSyncStateSchema.safeParse({}).success).toBe(false);
  });

  it('should reject a state carrying an unknown key (strict)', () => {
    expect(cookieSyncStateSchema.safeParse({ tree: [], foo: 1 }).success).toBe(false);
  });

  it('should reject a mapping node carrying an unknown field (TC-004, strict)', () => {
    const state = { tree: [{ kind: 'mapping', mapping: { ...validMapping, extra: 1 } }] };
    expect(cookieSyncStateSchema.safeParse(state).success).toBe(false);
  });

  it('should reject a folder node carrying an unknown field (TC-004, strict)', () => {
    const state = { tree: [{ ...folderNode(), extra: 1 }] };
    expect(cookieSyncStateSchema.safeParse(state).success).toBe(false);
  });
});
