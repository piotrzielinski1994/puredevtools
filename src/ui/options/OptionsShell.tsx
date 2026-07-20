import { useState } from 'react';
import { OptionsWorkspace } from '../shared/OptionsWorkspace';
import { SidebarChrome } from '../shared/SidebarChrome';
import { CookieSyncView } from '../cookies/CookieSyncView';
import type { CookieGateway } from '../cookies/cookieGateway';
import { cn } from '../lib/utils';

type View = 'rules' | 'cookies';

const TABS: { key: View; label: string }[] = [
  { key: 'rules', label: 'Rules' },
  { key: 'cookies', label: 'Cookie sync' },
];

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
  const sidebarHeader = (
    <>
      <SidebarChrome />
      <ViewSwitcher view={view} onChange={setView} />
    </>
  );

  if (view === 'rules') return <OptionsWorkspace sidebarHeader={sidebarHeader} />;
  return <CookieSyncView gateway={cookieGateway} sidebarHeader={sidebarHeader} />;
};
