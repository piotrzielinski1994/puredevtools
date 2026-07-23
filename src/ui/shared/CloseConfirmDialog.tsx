import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pziel/pureui";

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
  <Dialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onCancel();
    }}
  >
    <DialogContent showCloseButton={false} className="max-w-md">
      <DialogHeader>
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogDescription>
          "{ruleLabel}" has unsaved changes.
          {!canSave ? " Add a URL pattern to save, or discard." : null}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" disabled={!canSave} onClick={onSave}>
          Save
        </Button>
        <Button type="button" variant="destructive" onClick={onDiscard}>
          Discard
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
