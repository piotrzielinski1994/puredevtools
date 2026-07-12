import type { Rule } from './model';

export const cloneRule = (rule: Rule, newId: string): Rule => ({
  ...rule,
  id: newId,
  name: `${rule.name} (copy)`,
  matchers: {
    ...rule.matchers,
    methods: rule.matchers.methods ? [...rule.matchers.methods] : undefined,
  },
  actions: rule.actions.map((action) => ({ ...action })),
});
