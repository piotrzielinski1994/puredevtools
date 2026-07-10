import { useMemo } from 'react';
import { createGateway } from '../shared/createGateway';
import { OptionsWorkspace } from '../shared/OptionsWorkspace';
import { RulesProvider } from '../shared/RulesProvider';

export const App = () => {
  const gateway = useMemo(() => createGateway(), []);
  return (
    <RulesProvider gateway={gateway}>
      <OptionsWorkspace />
    </RulesProvider>
  );
};
