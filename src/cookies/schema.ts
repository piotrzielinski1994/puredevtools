import { z } from 'zod';
import type { CookieFolderNode, CookieMapping, CookieMappingNode, CookieSyncState, CookieTreeNode } from './model';

export const cookieMappingSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    enabled: z.boolean(),
    sourceUrl: z.string(),
    targetUrl: z.string(),
    cookieNames: z.array(z.string()),
  })
  .strict() satisfies z.ZodType<CookieMapping>;

const mappingNodeSchema = z
  .object({ kind: z.literal('mapping'), mapping: cookieMappingSchema })
  .strict() satisfies z.ZodType<CookieMappingNode>;

const folderNodeSchema: z.ZodType<CookieFolderNode> = z.lazy(() =>
  z
    .object({
      kind: z.literal('folder'),
      id: z.string().min(1),
      name: z.string(),
      collapsed: z.boolean(),
      children: z.array(treeNodeSchema),
    })
    .strict(),
);

const treeNodeSchema: z.ZodType<CookieTreeNode> = z.union([mappingNodeSchema, folderNodeSchema]);

export const cookieTreeSchema = z.array(treeNodeSchema);

export const cookieSyncStateSchema = z
  .object({
    tree: cookieTreeSchema,
  })
  .strict() satisfies z.ZodType<CookieSyncState>;

export const legacyCookieSyncStateSchema = z
  .object({
    mappings: z.array(cookieMappingSchema),
  })
  .strict();
