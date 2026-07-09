import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Rule } from '../../rules/model';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { createGateway } from '../shared/createGateway';
import { GlobalSwitch } from '../shared/GlobalSwitch';
import { ImportExport } from '../shared/ImportExport';
import { RuleForm } from '../shared/RuleForm';
import { RuleList } from '../shared/RuleList';
import { RulesProvider, useRules } from '../shared/RulesProvider';
import { ThemeSwitch } from '../shared/ThemeSwitch';
import { useTheme } from '../shared/useTheme';

type Editing = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; rule: Rule };

const Manager = () => {
  const { status, error, diagnostics } = useRules();
  const [theme, setTheme] = useTheme();
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [filter, setFilter] = useState('');

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
        <div className="flex items-center gap-4">
          <ThemeSwitch theme={theme} onChange={setTheme} />
          <GlobalSwitch />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" onClick={() => setEditing({ mode: 'create' })} disabled={isEditing}>
          <Plus />
          Add rule
        </Button>
        <ImportExport />
      </div>

      {diagnostics.errors.length > 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="mb-1 font-semibold">These rules could not be applied:</p>
          <ul className="list-disc pl-4">
            {diagnostics.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {diagnostics.unsupported.length > 0 ? (
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <p className="mb-1 font-semibold">Not enforceable on this browser:</p>
          <p>{diagnostics.unsupported.join(', ')}</p>
        </div>
      ) : null}

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
        <>
          <Input
            aria-label="Search rules"
            placeholder="Search rules by name or URL"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <RuleList filter={filter} onEdit={(rule) => setEditing({ mode: 'edit', rule })} />
        </>
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
