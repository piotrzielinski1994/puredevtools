import { useMemo } from 'react';
import { createGateway } from '../shared/createGateway';
import { RulesProvider } from '../shared/RulesProvider';
import { ShortcutsProvider } from '../shared/ShortcutsProvider';
import { ToastProvider } from '../components/ui/toast';
import { OptionsShell } from './OptionsShell';

export const App = () => {
  const gateway = useMemo(() => createGateway(), []);
  return (
    <ShortcutsProvider>
      <RulesProvider gateway={gateway}>
        <ToastProvider>
          <OptionsShell />
        </ToastProvider>
      </RulesProvider>
    </ShortcutsProvider>
  );
};
