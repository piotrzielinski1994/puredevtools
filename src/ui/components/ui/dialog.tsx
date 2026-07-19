import { useEffect, useRef, type ReactNode } from 'react';

export type DialogProps = {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
};

export const Dialog = ({ open, onClose, title, children }: DialogProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = 'dialog-title';

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        className="w-full max-w-md border border-border bg-popover text-popover-foreground shadow-md outline-none"
      >
        <h2 className="border-b px-4 py-3 text-sm font-semibold" id={titleId}>
          {title}
        </h2>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};
