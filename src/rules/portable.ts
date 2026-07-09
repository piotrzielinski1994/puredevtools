import { EXPORT_VERSION } from '../shared/constants';
import { portableSchema, type PortableState } from './schema';

export type ImportResult =
  | { ok: true; state: PortableState }
  | { ok: false; error: string };

export const exportRules = (state: PortableState): string =>
  JSON.stringify({ ...state, version: EXPORT_VERSION });

export const importRules = (json: string): ImportResult => {
  const parsed = parseJson(json);
  if (!parsed.ok) return parsed;
  const result = portableSchema.safeParse(parsed.value);
  if (!result.success) return { ok: false, error: result.error.message };
  return { ok: true, state: result.data };
};

const parseJson = (json: string): { ok: true; value: unknown } | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};
