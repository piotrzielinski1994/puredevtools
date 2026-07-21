import type { Rule } from './model';

export const copyRule = (rule: Rule, id: string, name: string): Rule => ({
  ...rule,
  id,
  name,
  matchers: {
    ...rule.matchers,
    methods: rule.matchers.methods ? [...rule.matchers.methods] : undefined,
  },
  actions: rule.actions.map((action) => ({ ...action })),
});

export const cloneRule = (rule: Rule, newId: string): Rule => copyRule(rule, newId, `${rule.name} (copy)`);
