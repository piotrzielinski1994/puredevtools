import { useMemo } from 'react';
import browser from 'webextension-polyfill';
import { createGateway } from '../shared/createGateway';
import { GlobalSwitch } from '../shared/GlobalSwitch';
import { RuleList } from '../shared/RuleList';
import { RulesProvider, useRules } from '../shared/RulesProvider';

const Summary = () => {
  const { status } = useRules();
  if (status === 'loading') return <p>Loading…</p>;
  return <RuleList onEdit={() => void browser.runtime.openOptionsPage()} />;
};

export const App = () => {
  const gateway = useMemo(() => createGateway(), []);
  return (
    <main style={{ minWidth: 340, padding: 12, fontFamily: 'system-ui, sans-serif' }}>
      <RulesProvider gateway={gateway}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 16, margin: 0 }}>ReqHook</h1>
          <GlobalSwitch />
        </header>
        <Summary />
        <button type="button" style={{ marginTop: 8 }} onClick={() => void browser.runtime.openOptionsPage()}>
          Manage rules…
        </button>
      </RulesProvider>
    </main>
  );
};
