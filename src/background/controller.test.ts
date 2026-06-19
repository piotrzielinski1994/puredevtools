import { describe, it, expect } from 'vitest';
import type { Rule } from '../rules/model';
import type { RuleRepository } from '../rules/storage';
import type { Capabilities, RequestEngine } from '../engine/RequestEngine';
import type { Message, MessageResponse } from '../shared/messages';
import { STORAGE_KEYS } from '../shared/constants';
import type { StorageChangeSubscriber, Scheduler } from './controller';
import { BackgroundController } from './controller';

const buildRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  priority: 0,
  matchers: { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  actions: [{ type: 'block' }],
  ...overrides,
});

type ApplyCall = { rules: Rule[]; globalEnabled: boolean };

type RecordingEngine = RequestEngine & {
  applyCalls: ApplyCall[];
  capabilitiesValue: Capabilities;
  failApply: (error: Error) => void;
};

const createRecordingEngine = (
  capabilitiesValue: Capabilities = { responseBodyRewrite: false, artificialLatency: false },
): RecordingEngine => {
  const applyCalls: ApplyCall[] = [];
  let pendingError: Error | undefined;
  return {
    applyCalls,
    capabilitiesValue,
    failApply: (error: Error) => {
      pendingError = error;
    },
    capabilities: () => capabilitiesValue,
    apply: async (rules: Rule[], globalEnabled: boolean) => {
      applyCalls.push({ rules, globalEnabled });
      if (pendingError) throw pendingError;
    },
    clear: async () => {},
  };
};

type FakeRepository = RuleRepository & {
  setRules: (rules: Rule[]) => void;
  setGlobalEnabledValue: (value: boolean) => void;
};

const createFakeRepository = (initialRules: Rule[] = [], initialGlobalEnabled = true): FakeRepository => {
  let rules = initialRules;
  let globalEnabled = initialGlobalEnabled;
  const fake = {
    getAll: async () => rules,
    getGlobalEnabled: async () => globalEnabled,
    setRules: (next: Rule[]) => {
      rules = next;
    },
    setGlobalEnabledValue: (next: boolean) => {
      globalEnabled = next;
    },
  };
  return fake as unknown as FakeRepository;
};

type CapturingSubscriber = StorageChangeSubscriber & {
  emit: (changedKeys: string[]) => void;
  listenerCount: number;
};

const createCapturingSubscriber = (): CapturingSubscriber => {
  const listeners: ((changedKeys: string[]) => void)[] = [];
  return {
    get listenerCount() {
      return listeners.length;
    },
    subscribe: (listener: (changedKeys: string[]) => void) => {
      listeners.push(listener);
    },
    emit: (changedKeys: string[]) => {
      listeners.forEach((listener) => listener(changedKeys));
    },
  };
};

type ImmediateScheduler = Scheduler;

const createImmediateScheduler = (): ImmediateScheduler => ({
  schedule: (task: () => void) => task(),
});

type CoalescingScheduler = Scheduler & {
  flush: () => void;
  scheduleCount: number;
};

const createCoalescingScheduler = (): CoalescingScheduler => {
  let pending: (() => void) | undefined;
  let scheduleCount = 0;
  return {
    get scheduleCount() {
      return scheduleCount;
    },
    schedule: (task: () => void) => {
      scheduleCount += 1;
      pending = task;
    },
    flush: () => {
      if (!pending) return;
      const task = pending;
      pending = undefined;
      task();
    },
  };
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('BackgroundController.start (AC-002)', () => {
  it('should call engine.apply exactly once on startup (TC-003)', async () => {
    const engine = createRecordingEngine();
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine,
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    expect(engine.applyCalls).toHaveLength(1);
  });

  it('should call engine.apply with the loaded rules and global flag on startup (TC-003)', async () => {
    const engine = createRecordingEngine();
    const rules = [buildRule({ id: 'a' })];
    const controller = new BackgroundController({
      repository: createFakeRepository(rules, true),
      engine,
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    expect(engine.applyCalls[0]).toEqual({ rules, globalEnabled: true });
  });

  it('should subscribe to storage changes on startup (AC-003)', async () => {
    const subscriber = createCapturingSubscriber();
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine: createRecordingEngine(),
      storageChanges: subscriber,
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    expect(subscriber.listenerCount).toBe(1);
  });
});

describe('BackgroundController storage change re-apply (AC-003)', () => {
  it('should re-apply when a change fires for the rules key (TC-004)', async () => {
    const engine = createRecordingEngine();
    const repository = createFakeRepository([buildRule({ id: 'a' })], true);
    const subscriber = createCapturingSubscriber();
    const controller = new BackgroundController({
      repository,
      engine,
      storageChanges: subscriber,
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    repository.setRules([buildRule({ id: 'b' })]);
    subscriber.emit([STORAGE_KEYS.rules]);
    await flushMicrotasks();
    expect(engine.applyCalls).toHaveLength(2);
    expect(engine.applyCalls[1].rules.map((rule) => rule.id)).toEqual(['b']);
  });

  it('should re-apply when a change fires for the globalEnabled key (TC-004)', async () => {
    const engine = createRecordingEngine();
    const repository = createFakeRepository([buildRule()], true);
    const subscriber = createCapturingSubscriber();
    const controller = new BackgroundController({
      repository,
      engine,
      storageChanges: subscriber,
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    repository.setGlobalEnabledValue(false);
    subscriber.emit([STORAGE_KEYS.globalEnabled]);
    await flushMicrotasks();
    expect(engine.applyCalls).toHaveLength(2);
    expect(engine.applyCalls[1].globalEnabled).toBe(false);
  });

  it('should not re-apply when a change fires for an unrelated key (edge case)', async () => {
    const engine = createRecordingEngine();
    const subscriber = createCapturingSubscriber();
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine,
      storageChanges: subscriber,
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    subscriber.emit(['someOtherKey']);
    await flushMicrotasks();
    expect(engine.applyCalls).toHaveLength(1);
  });

  it('should not schedule any task when a change fires for an unrelated key (edge case)', async () => {
    const scheduler = createCoalescingScheduler();
    const subscriber = createCapturingSubscriber();
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine: createRecordingEngine(),
      storageChanges: subscriber,
      scheduler,
    });
    await controller.start();
    subscriber.emit(['someOtherKey']);
    await flushMicrotasks();
    expect(scheduler.scheduleCount).toBe(0);
  });
});

describe('BackgroundController coalescing (AC-003)', () => {
  it('should coalesce two rapid changes into a single re-apply on flush (TC-005)', async () => {
    const engine = createRecordingEngine();
    const scheduler = createCoalescingScheduler();
    const subscriber = createCapturingSubscriber();
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine,
      storageChanges: subscriber,
      scheduler,
    });
    await controller.start();
    expect(engine.applyCalls).toHaveLength(1);
    subscriber.emit([STORAGE_KEYS.rules]);
    subscriber.emit([STORAGE_KEYS.rules]);
    scheduler.flush();
    await flushMicrotasks();
    expect(engine.applyCalls).toHaveLength(2);
  });

  it('should route every relevant change through the scheduler (TC-005)', async () => {
    const scheduler = createCoalescingScheduler();
    const subscriber = createCapturingSubscriber();
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine: createRecordingEngine(),
      storageChanges: subscriber,
      scheduler,
    });
    await controller.start();
    subscriber.emit([STORAGE_KEYS.rules]);
    subscriber.emit([STORAGE_KEYS.globalEnabled]);
    expect(scheduler.scheduleCount).toBe(2);
  });
});

describe('BackgroundController.handleMessage getCapabilities (AC-004)', () => {
  it('should resolve with the active engine capabilities (TC-006)', async () => {
    const capabilities: Capabilities = { responseBodyRewrite: true, artificialLatency: true };
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine: createRecordingEngine(capabilities),
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    const response = await controller.handleMessage({ type: 'getCapabilities' });
    expect(response).toEqual({ ok: true, type: 'capabilities', capabilities });
  });
});

describe('BackgroundController.handleMessage getDiagnostics', () => {
  it('should return the engine diagnostics when the engine provides them', async () => {
    const engine = { ...createRecordingEngine(), diagnostics: () => ({ errors: ['boom'], unsupported: ['latency'] }) };
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine,
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    const response = await controller.handleMessage({ type: 'getDiagnostics' });
    expect(response).toEqual({ ok: true, type: 'diagnostics', diagnostics: { errors: ['boom'], unsupported: ['latency'] } });
  });

  it('should fall back to empty diagnostics when the engine omits the method', async () => {
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine: createRecordingEngine(),
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    const response = await controller.handleMessage({ type: 'getDiagnostics' });
    expect(response).toEqual({ ok: true, type: 'diagnostics', diagnostics: { errors: [], unsupported: [] } });
  });
});

describe('BackgroundController.handleMessage reapply (AC-005)', () => {
  it('should resolve with a reapplied response (TC-007)', async () => {
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine: createRecordingEngine(),
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    const response = await controller.handleMessage({ type: 'reapply' });
    expect(response).toEqual({ ok: true, type: 'reapplied' });
  });

  it('should reload rules and call engine.apply again (TC-007)', async () => {
    const engine = createRecordingEngine();
    const repository = createFakeRepository([buildRule({ id: 'a' })], true);
    const controller = new BackgroundController({
      repository,
      engine,
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    repository.setRules([buildRule({ id: 'b' })]);
    await controller.handleMessage({ type: 'reapply' });
    expect(engine.applyCalls).toHaveLength(2);
    expect(engine.applyCalls[1].rules.map((rule) => rule.id)).toEqual(['b']);
  });

  it('should resolve to an error result if engine.apply rejects (edge case, ADT)', async () => {
    const engine = createRecordingEngine();
    engine.failApply(new Error('DNR cap exceeded'));
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine,
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start().catch(() => undefined);
    const response = await controller.handleMessage({ type: 'reapply' });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(typeof response.error).toBe('string');
      expect(response.error.length).toBeGreaterThan(0);
    }
  });
});

describe('BackgroundController.reapply (AC-005)', () => {
  it('should reload and call engine.apply again', async () => {
    const engine = createRecordingEngine();
    const repository = createFakeRepository([buildRule({ id: 'a' })], true);
    const controller = new BackgroundController({
      repository,
      engine,
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    repository.setRules([buildRule({ id: 'b' }), buildRule({ id: 'c' })]);
    await controller.reapply();
    expect(engine.applyCalls).toHaveLength(2);
    expect(engine.applyCalls[1].rules.map((rule) => rule.id)).toEqual(['b', 'c']);
  });
});

describe('BackgroundController global off (AC-006)', () => {
  it('should pass globalEnabled false through to engine.apply (TC-008)', async () => {
    const engine = createRecordingEngine();
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], false),
      engine,
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    expect(engine.applyCalls[0].globalEnabled).toBe(false);
  });
});

describe('BackgroundController empty rule set (AC-007)', () => {
  it('should apply an empty rule set without throwing (TC-009)', async () => {
    const engine = createRecordingEngine();
    const controller = new BackgroundController({
      repository: createFakeRepository([], true),
      engine,
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await expect(controller.start()).resolves.toBeUndefined();
    expect(engine.applyCalls[0]).toEqual({ rules: [], globalEnabled: true });
  });
});

describe('BackgroundController unknown message (edge case)', () => {
  it('should resolve to an error result for an unrecognized message type', async () => {
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine: createRecordingEngine(),
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    const response = await controller.handleMessage({ type: 'unknown' } as unknown as Message);
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(typeof response.error).toBe('string');
    }
  });

  it('should not throw for an unrecognized message type', async () => {
    const controller = new BackgroundController({
      repository: createFakeRepository([buildRule()], true),
      engine: createRecordingEngine(),
      storageChanges: createCapturingSubscriber(),
      scheduler: createImmediateScheduler(),
    });
    await controller.start();
    await expect(
      controller.handleMessage({ type: 'unknown' } as unknown as Message),
    ).resolves.toBeDefined();
  });
});

// Type-level assertion: MessageResponse error branch is reachable and string-typed.
const _errorResponse: MessageResponse = { ok: false, error: 'x' };
void _errorResponse;
