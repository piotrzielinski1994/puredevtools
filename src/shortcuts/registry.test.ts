import { describe, it, expect } from 'vitest';
import {
  SHORTCUT_ACTIONS,
  type ShortcutActionId,
  type ShortcutAction,
} from './registry';
import { safeNormalize } from './resolve';

// Every id in the spec tables (app-wide, options workspace, sidebar tree, devtools).
const ACTION_IDS: ShortcutActionId[] = [
  'toggle-theme',
  'toggle-global',
  'cycle-view',
  'open-shortcuts',
  'new-item',
  'delete-item',
  'save-rule',
  'sync-mapping',
  'new-folder',
  'duplicate-rule',
  'rename-node',
  'close-tab',
  'next-tab',
  'prev-tab',
  'import-rules',
  'export-rules',
  'collapse-all-folders',
  'expand-all-folders',
  'tree-nav-down',
  'tree-nav-up',
  'tree-nav-first',
  'tree-nav-last',
  'tree-expand',
  'tree-collapse',
  'tree-activate',
  'tree-move-down',
  'tree-move-up',
  'tree-outdent',
  'tree-nest',
  'open-context-menu',
  'clear-log',
  'focus-filter',
];

// C1 browser-reserved combos that a default must never sit on. -> TC-013, AC-013
const RESERVED_COMBOS = [
  'Mod+T',
  'Mod+W',
  'Mod+N',
  'Mod+Shift+N',
  'Mod+Shift+T',
  'Mod+Shift+W',
  'Mod+Shift+A',
  'Mod+Shift+I',
  'Mod+Shift+J',
  'Mod+Shift+C',
  'Mod+Shift+M',
  'Mod+L',
  'Mod+1',
  'Mod+2',
  'Mod+3',
  'Mod+4',
  'Mod+5',
  'Mod+6',
  'Mod+7',
  'Mod+8',
  'Mod+9',
];

describe('SHORTCUT_ACTIONS registry', () => {
  // TC-001 behavior: exactly the in-scope ids, each defined once.
  it('should define every in-scope action exactly once', () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id).sort();
    expect(ids).toEqual([...ACTION_IDS].sort());
  });

  // TC-001 behavior: no duplicate id sneaks in.
  it('should not repeat any action id', () => {
    const ids = SHORTCUT_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // TC-001 behavior: every action carries a non-empty display name.
  it('should give every action a non-empty name', () => {
    SHORTCUT_ACTIONS.forEach((action: ShortcutAction) => {
      expect(typeof action.name).toBe('string');
      expect(action.name.trim().length).toBeGreaterThan(0);
    });
  });

  // TC-001 behavior: every action carries a non-empty description.
  it('should give every action a non-empty description', () => {
    SHORTCUT_ACTIONS.forEach((action: ShortcutAction) => {
      expect(typeof action.description).toBe('string');
      expect(action.description.trim().length).toBeGreaterThan(0);
    });
  });

  // TC-001 behavior: every default is a safeNormalize-valid hotkey.
  it('should give every action a safeNormalize-valid default hotkey', () => {
    SHORTCUT_ACTIONS.forEach((action: ShortcutAction) => {
      expect(safeNormalize(action.defaultHotkey)).not.toBeNull();
    });
  });

  // TC-001, AC-001 behavior: the default is already stored in its normalized form.
  it('should store every default hotkey in already-normalized form', () => {
    SHORTCUT_ACTIONS.forEach((action: ShortcutAction) => {
      expect(safeNormalize(action.defaultHotkey)).toBe(action.defaultHotkey);
    });
  });

  // TC-013, AC-013 behavior: no default collides with a browser-reserved combo.
  it('should not bind any default to a browser-reserved combo', () => {
    const normalizedReserved = new Set(
      RESERVED_COMBOS.map((combo) => safeNormalize(combo) ?? combo),
    );
    SHORTCUT_ACTIONS.forEach((action: ShortcutAction) => {
      expect(normalizedReserved.has(action.defaultHotkey)).toBe(false);
    });
  });

  // TC-001, AC-001 behavior: no two actions ship the same default (avoids a
  // registry-level self-conflict).
  it('should not ship two actions with the same default hotkey', () => {
    const defaults = SHORTCUT_ACTIONS.map((action) => action.defaultHotkey);
    expect(new Set(defaults).size).toBe(defaults.length);
  });

  // TC-001, AC-001 behavior: the puredevtools-specific defaults from the spec tables.
  it('should bind the app-wide + workspace defaults exactly as the spec tables list them', () => {
    const byId = new Map(SHORTCUT_ACTIONS.map((action) => [action.id, action.defaultHotkey]));
    expect(byId.get('toggle-theme')).toBe('Mod+Shift+L');
    expect(byId.get('toggle-global')).toBe('Mod+Shift+G');
    expect(byId.get('cycle-view')).toBe('Mod+Shift+V');
    expect(byId.get('open-shortcuts')).toBe('Mod+Shift+K');
    expect(byId.get('new-item')).toBe('Mod+Alt+N');
    expect(byId.get('delete-item')).toBe('Mod+Backspace');
    expect(byId.get('save-rule')).toBe('Mod+S');
    expect(byId.get('sync-mapping')).toBe('Mod+Enter');
    expect(byId.get('new-folder')).toBe('Mod+Alt+F');
    expect(byId.get('duplicate-rule')).toBe('Alt+D');
    expect(byId.get('rename-node')).toBe('F2');
    expect(byId.get('close-tab')).toBe('Alt+W');
    expect(byId.get('next-tab')).toBe('Mod+Alt+ArrowRight');
    expect(byId.get('prev-tab')).toBe('Mod+Alt+ArrowLeft');
    expect(byId.get('import-rules')).toBe('Alt+I');
    expect(byId.get('export-rules')).toBe('Alt+E');
    expect(byId.get('collapse-all-folders')).toBe('Mod+Shift+[');
    expect(byId.get('expand-all-folders')).toBe('Mod+Shift+]');
  });

  // TC-001, AC-001 behavior: the sidebar-tree + devtools defaults.
  it('should bind the tree-nav + devtools defaults exactly as the spec tables list them', () => {
    const byId = new Map(SHORTCUT_ACTIONS.map((action) => [action.id, action.defaultHotkey]));
    expect(byId.get('tree-nav-down')).toBe('ArrowDown');
    expect(byId.get('tree-nav-up')).toBe('ArrowUp');
    expect(byId.get('tree-nav-first')).toBe('Home');
    expect(byId.get('tree-nav-last')).toBe('End');
    expect(byId.get('tree-expand')).toBe('ArrowRight');
    expect(byId.get('tree-collapse')).toBe('ArrowLeft');
    expect(byId.get('tree-activate')).toBe('Enter');
    expect(byId.get('tree-move-down')).toBe('Alt+ArrowDown');
    expect(byId.get('tree-move-up')).toBe('Alt+ArrowUp');
    expect(byId.get('tree-outdent')).toBe('Alt+ArrowLeft');
    expect(byId.get('tree-nest')).toBe('Alt+ArrowRight');
    expect(byId.get('open-context-menu')).toBe('Shift+F10');
    expect(byId.get('clear-log')).toBe('Alt+C');
    expect(byId.get('focus-filter')).toBe('Alt+F');
  });
});
