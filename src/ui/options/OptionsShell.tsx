import { useState } from 'react';
import { OptionsWorkspace } from '../shared/OptionsWorkspace';
import { SidebarChrome } from '../shared/SidebarChrome';
import { CookieSyncView } from '../cookies/CookieSyncView';
import { ShortcutsSection } from '../shortcuts/ShortcutsSection';
import { useActionHotkeys } from '../shared/useActionHotkeys';
import { useTheme } from '../shared/useTheme';
import { useRules } from '../shared/RulesProvider';
import type { CookieGateway } from '../cookies/cookieGateway';
import { cn } from '../lib/utils';

type View = 'rules' | 'cookies' | 'shortcuts';

const TABS: { key: View; label: string }[] = [
  { key: 'rules', label: 'Rules' },
  { key: 'cookies', label: 'Cookie sync' },
  { key: 'shortcuts', label: 'Shortcuts' },
];

const ORDER: View[] = ['rules', 'cookies', 'shortcuts'];

const ViewSwitcher = ({ view, onChange }: { view: View; onChange(view: View): void }) => (
  <div role="tablist" aria-label="Section" className="flex h-9 shrink-0 items-stretch border-b">
    {TABS.map((tab) => (
      <button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={view === tab.key}
        onClick={() => onChange(tab.key)}
        className={cn(
          'flex-1 text-sm font-medium',
          view === tab.key
            ? 'border-b-2 border-primary text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export const OptionsShell = ({ cookieGateway }: { cookieGateway?: CookieGateway }) => {
  const [view, setView] = useState<View>('rules');
  const [theme, setTheme] = useTheme();
  const { globalEnabled, toggleGlobal } = useRules();

  useActionHotkeys({
    'cycle-view': () => setView((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]),
    'open-shortcuts': () => setView('shortcuts'),
    'toggle-theme': () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    'toggle-global': () => void toggleGlobal(!globalEnabled),
  });

  const sidebarHeader = (
    <>
      <SidebarChrome />
      <ViewSwitcher view={view} onChange={setView} />
    </>
  );

  if (view === 'rules') return <OptionsWorkspace sidebarHeader={sidebarHeader} />;
  if (view === 'cookies') return <CookieSyncView gateway={cookieGateway} sidebarHeader={sidebarHeader} />;
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex flex-col bg-muted/30" style={{ width: 320 }}>
        {sidebarHeader}
      </aside>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ShortcutsSection />
      </div>
    </div>
  );
};
