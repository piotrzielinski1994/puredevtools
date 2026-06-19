import type { Rule } from './model';

export const mergeRules = (current: Rule[], imported: Rule[]): Rule[] => {
  const taken = new Set(current.map((rule) => rule.id));
  const appended = imported.map((rule) => {
    if (!taken.has(rule.id)) {
      taken.add(rule.id);
      return rule;
    }
    let suffix = 1;
    let newId = `${rule.id}-imported`;
    while (taken.has(newId)) {
      suffix += 1;
      newId = `${rule.id}-imported-${suffix}`;
    }
    taken.add(newId);
    return { ...rule, id: newId };
  });
  return [...current, ...appended].map((rule, index) => ({ ...rule, priority: index }));
};
