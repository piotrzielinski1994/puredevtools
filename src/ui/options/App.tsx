import { useMemo, useState } from 'react';
import type { Rule } from '../../rules/model';
import { createGateway } from '../shared/createGateway';
import { GlobalSwitch } from '../shared/GlobalSwitch';
import { ImportExport } from '../shared/ImportExport';
import { RuleForm } from '../shared/RuleForm';
import { RuleList } from '../shared/RuleList';
import { RulesProvider, useRules } from '../shared/RulesProvider';

type Editing = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; rule: Rule };

const Manager = () => {
  const { status, error } = useRules();
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });

  if (status === 'loading') return <p>Loading rules…</p>;
  if (status === 'error') return <p role="alert">Failed to load rules: {error}</p>;

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>ReqHook - Rules</h1>
        <GlobalSwitch />
      </header>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button type="button" onClick={() => setEditing({ mode: 'create' })}>
          + Add rule
        </button>
        <ImportExport />
      </div>
      {editing.mode === 'closed' ? (
        <RuleList onEdit={(rule) => setEditing({ mode: 'edit', rule })} />
      ) : (
        <RuleForm
          initial={editing.mode === 'edit' ? editing.rule : undefined}
          onDone={() => setEditing({ mode: 'closed' })}
        />
      )}
    </>
  );
};

export const App = () => {
  const gateway = useMemo(() => createGateway(), []);
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <RulesProvider gateway={gateway}>
        <Manager />
      </RulesProvider>
    </main>
  );
};
