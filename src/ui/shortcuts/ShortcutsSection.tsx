import { SHORTCUT_ACTIONS } from "../../shortcuts/registry";
import { resolveShortcuts } from "../../shortcuts/resolve";
import { useShortcutOverrides } from "../shared/shortcutsContext";
import { ShortcutRow } from "./ShortcutRow";

export const ShortcutsSection = () => {
  const overrides = useShortcutOverrides();
  const effective = resolveShortcuts(overrides);

  return (
    <section className="flex flex-col gap-1 p-4">
      <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
      <p className="text-xs text-muted-foreground">
        Press Add and type a combination to bind it; an action can have several.
        Remove the × on a binding to drop it (removing the last one disables the
        action). Escape cancels recording, so it cannot be assigned.
      </p>
      <div className="mt-2 divide-y divide-border">
        {SHORTCUT_ACTIONS.map((action) => (
          <ShortcutRow
            key={action.id}
            action={action}
            bindings={effective[action.id]}
            effective={effective}
            hasOverride={action.id in overrides}
          />
        ))}
      </div>
    </section>
  );
};
