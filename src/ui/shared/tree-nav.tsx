import { type Hotkey, matchesKeyboardEvent } from "@tanstack/hotkeys";
import { createContext, useContext } from "react";

export const openContextMenuOnKey = (
  event: React.KeyboardEvent,
  bindings: string[],
): boolean => {
  const isMenuKey =
    event.key === "ContextMenu" ||
    bindings.some((binding) =>
      matchesKeyboardEvent(event.nativeEvent, binding as Hotkey),
    );
  if (!isMenuKey) return false;
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  event.preventDefault();
  el.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2),
    }),
  );
  return true;
};

export type TreeNavState = {
  rovingId: string | null;
  contextMenuBindings: string[];
  registerRow: (id: string, el: HTMLElement | null) => void;
  handleKeyDown: (focusedId: string, event: React.KeyboardEvent) => void;
};

const TreeNavContext = createContext<TreeNavState>({
  rovingId: null,
  contextMenuBindings: ["Shift+F10"],
  registerRow: () => {},
  handleKeyDown: () => {},
});

export const TreeNavProvider = TreeNavContext.Provider;

export const useTreeNav = (): TreeNavState => useContext(TreeNavContext);
