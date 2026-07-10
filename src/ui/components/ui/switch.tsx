import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>;

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => (
  <label className="relative inline-flex items-center">
    <input ref={ref} type="checkbox" role="switch" className={cn('peer sr-only', className)} {...props} />
    <span
      aria-hidden
      className="h-5 w-9 shrink-0 cursor-pointer border border-input bg-input transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
    />
    <span
      aria-hidden
      className="pointer-events-none absolute left-0.5 size-4 bg-background shadow transition-transform peer-checked:translate-x-4"
    />
  </label>
));
Switch.displayName = 'Switch';
