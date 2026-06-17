import { describe, it, expect } from 'vitest';
import type { Matchers, Rule, RuleAction } from '../../rules/model';
import type { DnrApi } from './ChromeEngine';
import type { DnrRule } from './dnrTypes';
import { ChromeEngine } from './ChromeEngine';

type UpdateCall = { addRules: DnrRule[]; removeRuleIds: number[] };

const createFakeDnrApi = (
  initialIds: number[] = [],
): DnrApi & { calls: UpdateCall[]; existingIds: number[] } => {
  const existingIds = [...initialIds];
  const calls: UpdateCall[] = [];
  return {
    calls,
    existingIds,
    getDynamicRules: async () => existingIds.map((id) => ({ id })),
    updateDynamicRules: async (update: UpdateCall) => {
      calls.push(update);
    },
  };
};

const buildRule = (
  actions: RuleAction[] = [{ type: 'block' }],
  matchers: Matchers = { url: { pattern: 'https://api.example.com/*', kind: 'glob' } },
  overrides: Partial<Rule> = {},
): Rule => ({
  id: 'rule-1',
  name: 'test rule',
  enabled: true,
  priority: 0,
  matchers,
  actions,
  ...overrides,
});

describe('ChromeEngine.capabilities (TC-001, AC-002)', () => {
  it('should report responseBodyRewrite as false', () => {
    const engine = new ChromeEngine(createFakeDnrApi());
    expect(engine.capabilities().responseBodyRewrite).toBe(false);
  });

  it('should report artificialLatency as false', () => {
    const engine = new ChromeEngine(createFakeDnrApi());
    expect(engine.capabilities().artificialLatency).toBe(false);
  });
});

describe('ChromeEngine.apply (AC-001)', () => {
  it('should call updateDynamicRules exactly once', async () => {
    const dnr = createFakeDnrApi();
    const engine = new ChromeEngine(dnr);
    await engine.apply([buildRule()], true);
    expect(dnr.calls).toHaveLength(1);
  });

  it('should add the translated dnr rules for an enabled block rule', async () => {
    const dnr = createFakeDnrApi();
    const engine = new ChromeEngine(dnr);
    await engine.apply([buildRule([{ type: 'block' }])], true);
    expect(dnr.calls[0].addRules).toHaveLength(1);
    expect(dnr.calls[0].addRules[0].action.type).toBe('block');
  });

  it('should remove the previously installed dynamic rule ids', async () => {
    const dnr = createFakeDnrApi([10, 11]);
    const engine = new ChromeEngine(dnr);
    await engine.apply([buildRule()], true);
    expect(dnr.calls[0].removeRuleIds).toEqual([10, 11]);
  });

  it('should pass no removeRuleIds when there are no existing dynamic rules', async () => {
    const dnr = createFakeDnrApi();
    const engine = new ChromeEngine(dnr);
    await engine.apply([buildRule()], true);
    expect(dnr.calls[0].removeRuleIds).toEqual([]);
  });

  it('should add an empty rule set if globalEnabled is false (TC-009, AC-008)', async () => {
    const dnr = createFakeDnrApi([5]);
    const engine = new ChromeEngine(dnr);
    await engine.apply([buildRule()], false);
    expect(dnr.calls[0].addRules).toEqual([]);
  });

  it('should still remove existing rules when applying with globalEnabled false', async () => {
    const dnr = createFakeDnrApi([5, 6]);
    const engine = new ChromeEngine(dnr);
    await engine.apply([buildRule()], false);
    expect(dnr.calls[0].removeRuleIds).toEqual([5, 6]);
  });

  it('should translate multiple actions into multiple add rules', async () => {
    const dnr = createFakeDnrApi();
    const engine = new ChromeEngine(dnr);
    await engine.apply(
      [buildRule([{ type: 'block' }, { type: 'redirect', url: 'https://x.example.com/' }])],
      true,
    );
    expect(dnr.calls[0].addRules).toHaveLength(2);
  });
});

describe('ChromeEngine.clear', () => {
  it('should remove all existing dynamic rule ids and add none', async () => {
    const dnr = createFakeDnrApi([1, 2, 3]);
    const engine = new ChromeEngine(dnr);
    await engine.clear();
    expect(dnr.calls[0].removeRuleIds).toEqual([1, 2, 3]);
    expect(dnr.calls[0].addRules).toEqual([]);
  });

  it('should issue an updateDynamicRules call even when there are no existing rules', async () => {
    const dnr = createFakeDnrApi();
    const engine = new ChromeEngine(dnr);
    await engine.clear();
    expect(dnr.calls).toHaveLength(1);
    expect(dnr.calls[0].addRules).toEqual([]);
    expect(dnr.calls[0].removeRuleIds).toEqual([]);
  });
});
