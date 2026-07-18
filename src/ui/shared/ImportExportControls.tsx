import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { useRules } from './RulesProvider';

const REPLACE_MESSAGE = 'Import will replace all current rules. Continue?';

const readFile = async (file: File): Promise<{ ok: true; value: string } | { ok: false; error: string }> => {
  try {
    return { ok: true, value: await file.text() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const ImportExportControls = () => {
  const { exportRules, importRules } = useRules();
  const { show } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm(REPLACE_MESSAGE)) return;
    const text = await readFile(file);
    if (!text.ok) {
      show(`Import failed: ${text.error}`, 'error');
      return;
    }
    const outcome = await importRules(text.value, 'replace');
    if (outcome.ok) {
      show('Rules imported.', 'success');
      return;
    }
    show(`Import failed: ${outcome.error}`, 'error');
  };

  return (
    <>
      <button
        type="button"
        aria-label="Import rules"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Export rules"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => void exportRules()}
      >
        <Download className="size-4" />
      </button>
      <input
        ref={fileInputRef}
        data-testid="import-file-input"
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleImport(event)}
      />
    </>
  );
};
