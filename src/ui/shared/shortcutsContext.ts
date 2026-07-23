import { createContext, useContext } from "react";
import type {
  ShortcutActionId,
  ShortcutOverrides,
} from "../../shortcuts/registry";

export type ShortcutMutators = {
  addShortcut(id: ShortcutActionId, hotkey: string): void;
  removeShortcut(id: ShortcutActionId, hotkey: string): void;
  replaceShortcut(
    id: ShortcutActionId,
    oldHotkey: string,
    newHotkey: string,
  ): void;
  resetShortcut(id: ShortcutActionId): void;
};

export type ShortcutsContextValue = ShortcutMutators & {
  overrides: ShortcutOverrides;
};

const noop = (): void => {};

const DEFAULT_CONTEXT: ShortcutsContextValue = {
  overrides: {},
  addShortcut: noop,
  removeShortcut: noop,
  replaceShortcut: noop,
  resetShortcut: noop,
};

export const ShortcutsContext =
  createContext<ShortcutsContextValue>(DEFAULT_CONTEXT);

export const useShortcutOverrides = (): ShortcutOverrides =>
  useContext(ShortcutsContext).overrides;

export const useShortcuts = (): ShortcutMutators => {
  const { addShortcut, removeShortcut, replaceShortcut, resetShortcut } =
    useContext(ShortcutsContext);
  return { addShortcut, removeShortcut, replaceShortcut, resetShortcut };
};
