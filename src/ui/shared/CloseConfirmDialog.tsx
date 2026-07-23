import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";

export type CloseConfirmDialogProps = {
  open: boolean;
  ruleLabel: string;
  canSave: boolean;
  onSave(): void;
  onDiscard(): void;
  onCancel(): void;
};

export const CloseConfirmDialog = ({
  open,
  ruleLabel,
  canSave,
  onSave,
  onDiscard,
  onCancel,
}: CloseConfirmDialogProps) => (
  <Dialog open={open} onClose={onCancel} title="Unsaved changes">
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        "{ruleLabel}" has unsaved changes.
        {!canSave ? " Add a URL pattern to save, or discard." : null}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" disabled={!canSave} onClick={onSave}>
          Save
        </Button>
        <Button type="button" variant="destructive" onClick={onDiscard}>
          Discard
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  </Dialog>
);
