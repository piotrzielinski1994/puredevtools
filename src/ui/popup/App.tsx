import { useMemo } from 'react';
import { Settings } from 'lucide-react';
import browser from 'webextension-polyfill';
import { Button } from '../components/ui/button';
import { createGateway } from '../shared/createGateway';
import { GlobalSwitch } from '../shared/GlobalSwitch';
import { PopupTree } from './PopupTree';
import { RulesProvider, useRules } from '../shared/RulesProvider';
import { ShortcutsProvider } from '../shared/ShortcutsProvider';
import { useActionHotkeys } from '../shared/useActionHotkeys';
import { useTheme } from '../shared/useTheme';

const Summary = () => {
  const { status } = useRules();
  if (status === 'loading') return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <PopupTree onEdit={() => void browser.runtime.openOptionsPage()} />;
};

const PopupBody = () => {
  const { globalEnabled, toggleGlobal } = useRules();
  const [theme, setTheme] = useTheme();

  useActionHotkeys({
    'toggle-global': () => void toggleGlobal(!globalEnabled),
    'toggle-theme': () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  });

  return (
    <>
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight">puredevtools</h1>
        <GlobalSwitch />
      </header>
      <Summary />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={() => void browser.runtime.openOptionsPage()}
      >
        <Settings />
        Manage rules…
      </Button>
    </>
  );
};

export const App = () => {
  const gateway = useMemo(() => createGateway(), []);
  return (
    <main className="w-90 p-4">
      <ShortcutsProvider>
        <RulesProvider gateway={gateway}>
          <PopupBody />
        </RulesProvider>
      </ShortcutsProvider>
    </main>
  );
};
