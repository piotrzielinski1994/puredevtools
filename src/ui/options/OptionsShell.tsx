import { useState } from 'react';
import { OptionsWorkspace } from '../shared/OptionsWorkspace';
import { CookieSyncView } from '../cookies/CookieSyncView';
import type { CookieGateway } from '../cookies/cookieGateway';
import { cn } from '../lib/utils';

type View = 'rules' | 'cookies';

const TABS: { key: View; label: string }[] = [
  { key: 'rules', label: 'Rules' },
  { key: 'cookies', label: 'Cookie sync' },
];

export const OptionsShell = ({ cookieGateway }: { cookieGateway?: CookieGateway }) => {
  const [view, setView] = useState<View>('rules');

  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-9 shrink-0 items-stretch border-b bg-muted/30">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            className={cn(
              'px-4 text-sm font-medium',
              view === tab.key
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {view === 'rules' ? <OptionsWorkspace /> : <CookieSyncView gateway={cookieGateway} />}
      </div>
    </div>
  );
};
