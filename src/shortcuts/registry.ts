export type ShortcutActionId =
  | "toggle-theme"
  | "toggle-global"
  | "cycle-view"
  | "open-shortcuts"
  | "new-item"
  | "delete-item"
  | "save-rule"
  | "sync-mapping"
  | "new-folder"
  | "duplicate-rule"
  | "rename-node"
  | "close-tab"
  | "next-tab"
  | "prev-tab"
  | "import-rules"
  | "export-rules"
  | "collapse-all-folders"
  | "expand-all-folders"
  | "tree-nav-down"
  | "tree-nav-up"
  | "tree-nav-first"
  | "tree-nav-last"
  | "tree-expand"
  | "tree-collapse"
  | "tree-activate"
  | "tree-move-down"
  | "tree-move-up"
  | "tree-outdent"
  | "tree-nest"
  | "open-context-menu"
  | "clear-log"
  | "focus-filter";

export type ShortcutAction = {
  id: ShortcutActionId;
  name: string;
  description: string;
  defaultHotkey: string;
};

export type ShortcutOverrides = Partial<Record<ShortcutActionId, string[]>>;

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  {
    id: "toggle-theme",
    name: "Toggle theme",
    description: "Switch between light and dark theme.",
    defaultHotkey: "Mod+Shift+L",
  },
  {
    id: "toggle-global",
    name: "Toggle all rules",
    description: "Enable or disable every rule at once (global switch).",
    defaultHotkey: "Mod+Shift+G",
  },
  {
    id: "cycle-view",
    name: "Cycle view",
    description:
      "Move to the next options view: Rules, Cookie sync, Shortcuts.",
    defaultHotkey: "Mod+Shift+V",
  },
  {
    id: "open-shortcuts",
    name: "Open shortcuts",
    description: "Jump to the Shortcuts settings view.",
    defaultHotkey: "Mod+Shift+K",
  },
  {
    id: "new-item",
    name: "New item",
    description:
      "Create a new rule in the Rules view or a new mapping in the Cookie sync view.",
    defaultHotkey: "Mod+Alt+N",
  },
  {
    id: "delete-item",
    name: "Delete item",
    description: "Delete the active rule/node or the selected cookie mapping.",
    defaultHotkey: "Mod+Backspace",
  },
  {
    id: "save-rule",
    name: "Save rule",
    description: "Save the active rule form.",
    defaultHotkey: "Mod+S",
  },
  {
    id: "sync-mapping",
    name: "Sync mapping",
    description: "Sync the selected cookie mapping now.",
    defaultHotkey: "Mod+Enter",
  },
  {
    id: "new-folder",
    name: "New folder",
    description: "Create a new folder in the Rules view.",
    defaultHotkey: "Mod+Alt+F",
  },
  {
    id: "duplicate-rule",
    name: "Duplicate rule",
    description: "Duplicate the focused rule.",
    defaultHotkey: "Alt+D",
  },
  {
    id: "rename-node",
    name: "Rename",
    description: "Rename the focused folder.",
    defaultHotkey: "F2",
  },
  {
    id: "close-tab",
    name: "Close tab",
    description: "Close the active rule tab.",
    defaultHotkey: "Alt+W",
  },
  {
    id: "next-tab",
    name: "Next tab",
    description: "Activate the next open rule tab.",
    defaultHotkey: "Mod+Alt+ArrowRight",
  },
  {
    id: "prev-tab",
    name: "Previous tab",
    description: "Activate the previous open rule tab.",
    defaultHotkey: "Mod+Alt+ArrowLeft",
  },
  {
    id: "import-rules",
    name: "Import rules",
    description: "Import rules from a JSON file.",
    defaultHotkey: "Alt+I",
  },
  {
    id: "export-rules",
    name: "Export rules",
    description: "Export all rules to a JSON file.",
    defaultHotkey: "Alt+E",
  },
  {
    id: "collapse-all-folders",
    name: "Collapse all folders",
    description: "Collapse every folder in the sidebar tree.",
    defaultHotkey: "Mod+Shift+[",
  },
  {
    id: "expand-all-folders",
    name: "Expand all folders",
    description: "Expand every folder in the sidebar tree.",
    defaultHotkey: "Mod+Shift+]",
  },
  {
    id: "tree-nav-down",
    name: "Tree: next row",
    description: "Move focus and selection to the next visible sidebar row.",
    defaultHotkey: "ArrowDown",
  },
  {
    id: "tree-nav-up",
    name: "Tree: previous row",
    description:
      "Move focus and selection to the previous visible sidebar row.",
    defaultHotkey: "ArrowUp",
  },
  {
    id: "tree-nav-first",
    name: "Tree: first row",
    description: "Move focus and selection to the first visible sidebar row.",
    defaultHotkey: "Home",
  },
  {
    id: "tree-nav-last",
    name: "Tree: last row",
    description: "Move focus and selection to the last visible sidebar row.",
    defaultHotkey: "End",
  },
  {
    id: "tree-expand",
    name: "Tree: expand / into folder",
    description:
      "Expand a collapsed folder, or move focus to its first child if open.",
    defaultHotkey: "ArrowRight",
  },
  {
    id: "tree-collapse",
    name: "Tree: collapse / to parent",
    description:
      "Collapse an expanded folder, or move focus to the parent folder.",
    defaultHotkey: "ArrowLeft",
  },
  {
    id: "tree-activate",
    name: "Tree: open rule / toggle folder",
    description: "Open the focused rule, or toggle the focused folder.",
    defaultHotkey: "Enter",
  },
  {
    id: "tree-move-down",
    name: "Tree: move node down",
    description: "Reorder the focused node down among its siblings.",
    defaultHotkey: "Alt+ArrowDown",
  },
  {
    id: "tree-move-up",
    name: "Tree: move node up",
    description: "Reorder the focused node up among its siblings.",
    defaultHotkey: "Alt+ArrowUp",
  },
  {
    id: "tree-outdent",
    name: "Tree: outdent node",
    description: "Move the focused node out to its parent's level.",
    defaultHotkey: "Alt+ArrowLeft",
  },
  {
    id: "tree-nest",
    name: "Tree: nest node into folder above",
    description:
      "Move the focused node into the immediately-preceding sibling folder.",
    defaultHotkey: "Alt+ArrowRight",
  },
  {
    id: "open-context-menu",
    name: "Open context menu",
    description: "Open the focused sidebar row's context menu.",
    defaultHotkey: "Shift+F10",
  },
  {
    id: "clear-log",
    name: "Clear log",
    description: "Clear the DevTools intercept log.",
    defaultHotkey: "Alt+C",
  },
  {
    id: "focus-filter",
    name: "Focus filter",
    description: "Focus the DevTools URL filter input.",
    defaultHotkey: "Alt+F",
  },
];
