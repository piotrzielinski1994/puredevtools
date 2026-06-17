import { useState, type ChangeEvent } from 'react';
import { useRules } from './RulesProvider';

export const ImportExport = () => {
  const { exportRules, importRules } = useRules();
  const [error, setError] = useState<string | undefined>(undefined);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(undefined);
    const outcome = await importRules(await file.text());
    if (!outcome.ok) setError(outcome.error);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => void exportRules()}>
        Export
      </button>
      <label>
        Import
        <input data-testid="import-input" type="file" accept="application/json" onChange={(event) => void onFile(event)} />
      </label>
      {error ? <span role="alert" style={{ color: '#c00' }}>{error}</span> : null}
    </div>
  );
};
