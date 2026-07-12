import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

type Option = { value: string; label: ReactNode };

export type SelectProps = {
  id?: string;
  value: string;
  onChange(event: { target: { value: string } }): void;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  children: ReactNode;
};

const readOptions = (children: ReactNode): Option[] =>
  Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const props = child.props as { value?: string; children?: ReactNode };
      return { value: String(props.value ?? ''), label: props.children };
    });

export const Select = ({ id, value, onChange, className, disabled, children, ...props }: SelectProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options = readOptions(children);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next: string) => {
    setOpen(false);
    if (next !== value) onChange({ target: { value: next } });
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={props['aria-label']}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full items-center justify-between gap-2 border border-input bg-transparent pl-3 pr-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full min-w-max overflow-auto border border-border bg-popover py-1 text-sm text-popover-foreground shadow-md"
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => choose(option.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
              >
                <Check className={cn('size-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} />
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
