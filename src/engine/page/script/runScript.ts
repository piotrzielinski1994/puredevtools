export type ScriptOutcome = { ok: true } | { ok: false; error: string };

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<unknown>;

let running = false;

export const isScriptRunning = (): boolean => running;

export const runScript = async (
  source: string,
  bindings: Record<string, unknown>,
): Promise<ScriptOutcome> => {
  const names = Object.keys(bindings);
  const values = names.map((name) => bindings[name]);

  const buildFn = ():
    | ((...values: unknown[]) => Promise<unknown>)
    | { error: string } => {
    try {
      return new AsyncFunction(...names, source);
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : String(cause) };
    }
  };

  const fn = buildFn();
  if ("error" in fn) return { ok: false, error: fn.error };

  running = true;
  try {
    await fn(...values);
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    running = false;
  }
};
