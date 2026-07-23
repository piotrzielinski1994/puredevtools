import type { LogAction, LogState } from "./types";

export const MAX_ENTRIES = 500;

export const emptyLog = (): LogState => ({ entries: [], nextId: 1 });

export const reduceLog = (state: LogState, action: LogAction): LogState => {
  if (action.type === "clear") return { entries: [], nextId: state.nextId };
  const appended = [...state.entries, { ...action.report, id: state.nextId }];
  const entries =
    appended.length > MAX_ENTRIES
      ? appended.slice(appended.length - MAX_ENTRIES)
      : appended;
  return { entries, nextId: state.nextId + 1 };
};
