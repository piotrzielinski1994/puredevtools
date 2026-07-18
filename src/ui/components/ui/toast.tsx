import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

const DISMISS_MS = 2500;

type ToastVariant = 'success' | 'error';

type Toast = { id: number; message: string; variant?: ToastVariant };

type ToastContextValue = { show(message: string, variant?: ToastVariant): void };

const ToastContext = createContext<ToastContextValue | null>(null);

const NOOP: ToastContextValue = { show: () => undefined };

const variantClass = (variant?: ToastVariant): string => {
  if (variant === 'success') return 'text-emerald-600';
  if (variant === 'error') return 'text-destructive';
  return 'text-popover-foreground';
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, variant?: ToastVariant) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), DISMISS_MS);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto border bg-popover px-3 py-2 text-xs shadow-md ${variantClass(toast.variant)}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => useContext(ToastContext) ?? NOOP;
