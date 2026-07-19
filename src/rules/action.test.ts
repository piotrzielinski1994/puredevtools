import { describe, it, expect } from 'vitest';
import type { Rule, RuleAction } from './model';
import { firstAction } from './action';

const ruleWith = (actions: RuleAction[]): Rule => ({
  id: 'r1',
  name: 'r',
  enabled: true,
  matchers: { url: { pattern: '*', kind: 'glob' } },
  actions,
});

describe('firstAction', () => {
  it('should return the first action matching the requested type, narrowed', () => {
    const rule = ruleWith([
      { type: 'modifyResponseHeaders', headers: [{ op: 'set', name: 'X', value: '1' }] },
      { type: 'rewriteBody', body: 'a', contentType: 'application/json' },
    ]);

    const rewrite = firstAction(rule, 'rewriteBody');

    expect(rewrite).toEqual({ type: 'rewriteBody', body: 'a', contentType: 'application/json' });
  });

  it('should return undefined if no action of the requested type exists', () => {
    const rule = ruleWith([{ type: 'rewriteBody', body: 'a' }]);

    expect(firstAction(rule, 'modifyResponseHeaders')).toBeUndefined();
  });

  it('should return only the first when several actions share the type', () => {
    const rule = ruleWith([
      { type: 'rewriteBody', body: 'first' },
      { type: 'rewriteBody', body: 'second' },
    ]);

    expect(firstAction(rule, 'rewriteBody')?.body).toBe('first');
  });
});
