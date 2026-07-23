import { z } from "zod";

export const shortcutOverridesSchema = z
  .record(z.string(), z.array(z.string()))
  .catch({});
