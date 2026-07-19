// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { runScript, isScriptRunning } from './runScript';

describe('runScript (AC-003)', () => {
  it('should return ok true for a script that runs to completion', async () => {
    // behavior: a valid, effect-free script resolves to the ok branch
    const outcome = await runScript('const x = 1 + 1;', {});

    expect(outcome).toEqual({ ok: true });
  });

  it('should expose each binding key as an in-scope variable to the source', async () => {
    // behavior: bindings become named variables the script can read
    const seen: { value?: unknown } = {};
    const outcome = await runScript('seen.value = injected;', { seen, injected: 42 });

    expect(outcome.ok).toBe(true);
    expect(seen.value).toBe(42);
  });

  it('should let a script mutate an object binding observably after the await resolves', async () => {
    // behavior: mutations to a bound object are visible to the host once runScript resolves
    const target = { url: 'https://old', count: 0 };
    const outcome = await runScript('target.url = "https://new"; target.count = target.count + 1;', { target });

    expect(outcome).toEqual({ ok: true });
    expect(target.url).toBe('https://new');
    expect(target.count).toBe(1);
  });

  it('should await asynchronous work inside the source before resolving', async () => {
    // behavior: an `await` in the body is honored - the mutation lands before the outcome
    const target = { done: false };
    const outcome = await runScript(
      'await new Promise((r) => setTimeout(r, 0)); target.done = true;',
      { target },
    );

    expect(outcome).toEqual({ ok: true });
    expect(target.done).toBe(true);
  });

  it('should support a bound async function called with await', async () => {
    // behavior: awaiting a bound async binding works and its result is usable
    const target: { token?: string } = {};
    const fetchToken = (): Promise<string> => Promise.resolve('abc');
    const outcome = await runScript('target.token = await fetchToken();', { target, fetchToken });

    expect(outcome).toEqual({ ok: true });
    expect(target.token).toBe('abc');
  });

  it('should return the error branch (not throw) when the script throws synchronously', async () => {
    // behavior: a throwing script surfaces as { ok:false } and never rejects to the caller
    const outcome = await runScript('throw new Error("boom");', {});

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected error outcome');
    expect(outcome.error).toContain('boom');
  });

  it('should return the error branch when the script rejects asynchronously', async () => {
    // behavior: an awaited rejection is caught and mapped to { ok:false }
    const outcome = await runScript(
      'await new Promise((_, reject) => reject(new Error("async boom")));',
      {},
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected error outcome');
    expect(outcome.error).toContain('async boom');
  });

  it('should return the error branch (not throw) when the source fails to construct', async () => {
    // behavior: a syntactically invalid source (would also throw under strict CSP) degrades gracefully
    const outcome = await runScript('this is ((( not valid javascript', {});

    expect(outcome.ok).toBe(false);
  });

  it('should keep a prior binding mutation even when a later statement throws', async () => {
    // behavior: effects recorded before the throw stay applied; only the outcome is error
    const target = { saved: false };
    const outcome = await runScript('target.saved = true; throw new Error("late");', { target });

    expect(outcome.ok).toBe(false);
    expect(target.saved).toBe(true);
  });
});

describe('isScriptRunning (AC-003)', () => {
  it('should report false before any script has run', () => {
    // behavior: the guard is off at rest
    expect(isScriptRunning()).toBe(false);
  });

  it('should report true synchronously while a script body executes', async () => {
    // behavior: inside a run the flag is set, so a re-entrant caller can detect recursion
    const captured: { during?: boolean } = {};
    const check = (): boolean => isScriptRunning();
    const outcome = await runScript('captured.during = check();', { captured, check });

    expect(outcome.ok).toBe(true);
    expect(captured.during).toBe(true);
  });

  it('should report false again after the script completes', async () => {
    // behavior: the guard resets on the normal path
    await runScript('const x = 1;', {});

    expect(isScriptRunning()).toBe(false);
  });

  it('should reset to false even after a throwing script', async () => {
    // behavior: the guard is cleared in a finally so a thrown error does not wedge it on
    await runScript('throw new Error("boom");', {});

    expect(isScriptRunning()).toBe(false);
  });

  it('should reset to false even after a construction failure', async () => {
    // behavior: a source that never constructs must still leave the guard off
    await runScript(']]] not valid', {});

    expect(isScriptRunning()).toBe(false);
  });
});
