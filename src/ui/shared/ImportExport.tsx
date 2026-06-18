import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useRules } from './RulesProvider';

export const ImportExport = () => {
  const { exportRules, importRules } = useRules();
  const [error, setError] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(undefined);
    const outcome = await importRules(await file.text());
    if (!outcome.ok) setError(outcome.error);
  };

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void exportRules()}>
        <Download />
        Export
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload />
        Import
      </Button>
      <input
        ref={inputRef}
        data-testid="import-input"
        type="file"
        accept="application/json"
        className="sr-only"
        onChange={(event) => void onFile(event)}
      />
      {error ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
};
