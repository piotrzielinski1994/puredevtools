import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Rule } from '../../rules/model';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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

  if (status === 'loading') return <p className="text-sm text-muted-foreground">Loading rules…</p>;
  if (status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Failed to load rules: {error}
      </p>
    );
  }

  const isEditing = editing.mode !== 'closed';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ReqHook</h1>
          <p className="text-sm text-muted-foreground">Intercept, rewrite, and mock HTTP traffic.</p>
        </div>
        <GlobalSwitch />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" onClick={() => setEditing({ mode: 'create' })} disabled={isEditing}>
          <Plus />
          Add rule
        </Button>
        <ImportExport />
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing.mode === 'edit' ? 'Edit rule' : 'New rule'}</CardTitle>
          </CardHeader>
          <CardContent>
            <RuleForm
              initial={editing.mode === 'edit' ? editing.rule : undefined}
              onDone={() => setEditing({ mode: 'closed' })}
            />
          </CardContent>
        </Card>
      ) : (
        <RuleList onEdit={(rule) => setEditing({ mode: 'edit', rule })} />
      )}
    </div>
  );
};

export const App = () => {
  const gateway = useMemo(() => createGateway(), []);
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <RulesProvider gateway={gateway}>
        <Manager />
      </RulesProvider>
    </main>
  );
};
