import { z } from 'zod';
import type { CookieMapping, CookieSyncState } from './model';

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

export const cookieSyncStateSchema = z
  .object({
    mappings: z.array(cookieMappingSchema),
  })
  .strict() satisfies z.ZodType<CookieSyncState>;
