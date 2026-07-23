import { Input } from "@pziel/pureui";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collectFolderIds, findNode } from "../../rules/tree";
import { CloseConfirmDialog } from "./CloseConfirmDialog";
import { createTabsStore } from "./createTabsStore";
import { RuleForm } from "./RuleForm";
import { useRules } from "./RulesProvider";
import { RuleTabs } from "./RuleTabs";
import {
  draftsEqual,
  draftToRule,
  emptyDraft,
  type RuleDraft,
  ruleToDraft,
} from "./ruleDraft";
import { SidebarTree } from "./SidebarTree";
import { useActionHotkeys } from "./useActionHotkeys";
import { useDragWidth } from "./useDragWidth";
import { DRAFT_KEY, type TabsStore, useOpenTabs } from "./useOpenTabs";
import { useRuleDrafts } from "./useRuleDrafts";

const SIDEBAR_DEFAULT = 320;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 560;

export const OptionsWorkspace = ({
  tabsStore,
  sidebarHeader,
}: {
  tabsStore?: TabsStore;
  sidebarHeader?: React.ReactNode;
}) => {
  const {
    workspace,
    rules,
    status,
    error,
    addRule,
    updateRule,
    removeNode,
    toggleCollapse,
  } = useRules();
  const [filter, setFilter] = useState("");
  const [pendingClose, setPendingClose] = useState<string | null>(null);

  const sidebar = useDragWidth(SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX);

  const store = useMemo(() => tabsStore ?? createTabsStore(), [tabsStore]);
  const ruleIds = useMemo(() => rules.map((rule) => rule.id), [rules]);
  const { openKeys, activeKey, open, close, setActive } = useOpenTabs(ruleIds, {
    store,
    ready: status === "ready",
  });

  const drafts = useRuleDrafts();
  const rulesById = useMemo(
    () => new Map(rules.map((rule) => [rule.id, rule] as const)),
    [rules],
  );

  useEffect(() => {
    drafts.prune(openKeys);
  }, [openKeys, drafts]);

  const baselineFor = (key: string): RuleDraft => {
    if (key === DRAFT_KEY) return emptyDraft();
    const rule = rulesById.get(key);
    return rule ? ruleToDraft(rule) : emptyDraft();
  };
  const draftFor = (key: string): RuleDraft =>
    drafts.getEdit(key) ?? baselineFor(key);
  const isDirty = (key: string): boolean => {
    const edit = drafts.getEdit(key);
    return edit !== undefined && !draftsEqual(edit, baselineFor(key));
  };

  const labelFor = (key: string): string =>
    key === DRAFT_KEY ? "New rule" : (rulesById.get(key)?.name ?? key);

  const tabs = openKeys.map((key) => ({
    key,
    label: labelFor(key),
    isDirty: isDirty(key),
  }));

  const commitTab = async (
    key: string,
  ): Promise<{ ok: boolean; error?: string; ruleId?: string }> => {
    const built = draftToRule(
      draftFor(key),
      key === DRAFT_KEY ? undefined : rulesById.get(key),
    );
    if (!built.ok) return { ok: false, error: built.error };
    await (key === DRAFT_KEY ? addRule(built.rule) : updateRule(built.rule));
    drafts.discard(key);
    return { ok: true, ruleId: built.rule.id };
  };

  const requestClose = (key: string) => {
    if (isDirty(key)) {
      setPendingClose(key);
      return;
    }
    drafts.discard(key);
    close(key);
  };

  const shiftActive = (delta: number) => {
    if (openKeys.length === 0 || activeKey === null) return;
    const index = openKeys.indexOf(activeKey);
    if (index === -1) return;
    const next = (index + delta + openKeys.length) % openKeys.length;
    setActive(openKeys[next]);
  };

  const setCollapsedAll = (collapsed: boolean) =>
    collectFolderIds(workspace).forEach((id) => {
      const folder = findNode(workspace, id);
      if (folder?.kind === "folder" && folder.collapsed !== collapsed)
        void toggleCollapse(id);
    });

  useActionHotkeys({
    "new-item": () => open(DRAFT_KEY),
    "delete-item": () => {
      if (activeKey !== null && activeKey !== DRAFT_KEY)
        void removeNode(activeKey);
    },
    "close-tab": () => {
      if (activeKey !== null) requestClose(activeKey);
    },
    "next-tab": () => shiftActive(1),
    "prev-tab": () => shiftActive(-1),
    "collapse-all-folders": () => setCollapsedAll(true),
    "expand-all-folders": () => setCollapsedAll(false),
  });

  return (
    <div className="flex h-full flex-col">
      {status === "loading" ? (
        <p className="p-4 text-sm text-muted-foreground">Loading rules…</p>
      ) : status === "error" ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          Failed to load rules: {error}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside
            className="flex flex-col bg-muted/30"
            style={{ width: sidebar.width }}
          >
            {sidebarHeader}
            <div className="flex h-9 shrink-0 items-stretch border-b">
              <Input
                aria-label="Search rules"
                placeholder="Search rules"
                className="h-full border-0 bg-transparent shadow-none focus-visible:ring-0"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <SidebarTree
              filter={filter}
              onEdit={(ruleId) => open(ruleId)}
              onNewRule={() => open(DRAFT_KEY)}
            />
          </aside>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={sidebar.onHandleMouseDown}
            className="relative w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2"
          />

          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-stretch border-b bg-muted/30">
              <RuleTabs
                tabs={tabs}
                activeKey={activeKey}
                onActivate={setActive}
                onClose={requestClose}
              />
              <button
                type="button"
                aria-label="New rule"
                onClick={() => open(DRAFT_KEY)}
                className="shrink-0 px-2 text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {activeKey === null ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a rule to edit
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <RuleForm
                  key={activeKey}
                  draft={draftFor(activeKey)}
                  onDraftChange={(next) => drafts.setEdit(activeKey, next)}
                  onSave={async () => {
                    const result = await commitTab(activeKey);
                    if (result.ok && activeKey === DRAFT_KEY && result.ruleId) {
                      close(DRAFT_KEY);
                      open(result.ruleId);
                    }
                    return result;
                  }}
                />
              </div>
            )}
          </section>
        </div>
      )}
      <CloseConfirmDialog
        open={pendingClose !== null}
        ruleLabel={pendingClose !== null ? labelFor(pendingClose) : ""}
        canSave={
          pendingClose !== null &&
          draftToRule(
            draftFor(pendingClose),
            pendingClose === DRAFT_KEY
              ? undefined
              : rulesById.get(pendingClose),
          ).ok
        }
        onSave={async () => {
          if (pendingClose === null) return;
          const result = await commitTab(pendingClose);
          if (result.ok) close(pendingClose);
          setPendingClose(null);
        }}
        onDiscard={() => {
          if (pendingClose === null) return;
          drafts.discard(pendingClose);
          close(pendingClose);
          setPendingClose(null);
        }}
        onCancel={() => setPendingClose(null)}
      />
    </div>
  );
};
