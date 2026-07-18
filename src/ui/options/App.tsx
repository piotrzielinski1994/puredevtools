import { useMemo } from 'react';
import { createGateway } from '../shared/createGateway';
import { OptionsWorkspace } from '../shared/OptionsWorkspace';
import { RulesProvider } from '../shared/RulesProvider';
import { ToastProvider } from '../components/ui/toast';

export const App = () => {
  const gateway = useMemo(() => createGateway(), []);
  return (
    <RulesProvider gateway={gateway}>
      <ToastProvider>
        <OptionsWorkspace />
      </ToastProvider>
    </RulesProvider>
  );
};
