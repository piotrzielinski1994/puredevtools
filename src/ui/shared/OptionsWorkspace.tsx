import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '../components/ui/input';
import { GlobalSwitch } from './GlobalSwitch';
import { RuleForm } from './RuleForm';
import { RuleList } from './RuleList';
import { RuleTabs } from './RuleTabs';
import { ThemeSwitch } from './ThemeSwitch';
import { useOpenTabs, DRAFT_KEY } from './useOpenTabs';
import { useDragWidth } from './useDragWidth';
import { useRules } from './RulesProvider';
import { useTheme } from './useTheme';

const SIDEBAR_DEFAULT = 320;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 560;

export const OptionsWorkspace = () => {
  const { rules, status, error } = useRules();
  const [theme, setTheme] = useTheme();
  const [filter, setFilter] = useState('');

  const sidebar = useDragWidth(SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX);

  const ruleIds = useMemo(() => rules.map((rule) => rule.id), [rules]);
  const { openKeys, activeKey, open, close, setActive } = useOpenTabs(ruleIds);

  const rulesById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule] as const)), [rules]);
  const tabs = openKeys.map((key) => ({
    key,
    label: key === DRAFT_KEY ? 'New rule' : (rulesById.get(key)?.name ?? key),
  }));

  const activeRule = activeKey !== null && activeKey !== DRAFT_KEY ? rulesById.get(activeKey) : undefined;

  return (
    <div className="flex h-screen flex-col">
      {status === 'loading' ? (
        <p className="p-4 text-sm text-muted-foreground">Loading rules…</p>
      ) : status === 'error' ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          Failed to load rules: {error}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex flex-col bg-muted/30" style={{ width: sidebar.width }}>
            <div className="flex h-9 shrink-0 items-center justify-between border-b pl-3 text-sm font-semibold">
              ReqHook
              <div className="flex h-full items-center gap-3 pr-3">
                <GlobalSwitch />
                <ThemeSwitch theme={theme} onChange={setTheme} />
              </div>
            </div>
            <div className="flex h-9 shrink-0 items-stretch border-b">
              <Input
                aria-label="Search rules"
                placeholder="Search rules"
                className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RuleList filter={filter} onEdit={(rule) => open(rule.id)} />
            </div>
          </aside>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={sidebar.onHandleMouseDown}
            className="relative w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2"
          />

          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-stretch border-b bg-muted/30">
              <RuleTabs tabs={tabs} activeKey={activeKey} onActivate={setActive} onClose={close} />
              <button
                type="button"
                aria-label="New rule"
                onClick={() => open(DRAFT_KEY)}
                className="shrink-0 px-2 text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {activeKey === null ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a rule to edit
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <RuleForm key={activeKey} initial={activeRule} onDone={() => close(activeKey)} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
