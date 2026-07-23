import type { LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { useEffect } from "react";

export type ContextMenuItem = {
  label: string;
  icon: ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;
  destructive?: boolean;
  onSelect(): void;
};

export type ContextMenuPosition = { x: number; y: number };

export const ContextMenu = ({
  position,
  items,
  onClose,
}: {
  position: ContextMenuPosition;
  items: ContextMenuItem[];
  onClose(): void;
}) => {
  useEffect(() => {
    const dismiss = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("contextmenu", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("contextmenu", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-40 border border-border bg-popover py-1 text-sm text-popover-foreground shadow-md"
      style={{ top: position.y, left: position.x }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground ${item.destructive ? "text-destructive" : ""}`}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </button>
      ))}
    </div>
  );
};
