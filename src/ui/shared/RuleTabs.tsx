import { X } from "lucide-react";
import { cn } from "../lib/utils";

export type RuleTab = { key: string; label: string; isDirty?: boolean };

export type RuleTabsProps = {
  tabs: RuleTab[];
  activeKey: string | null;
  onActivate(key: string): void;
  onClose(key: string): void;
};

export const RuleTabs = ({
  tabs,
  activeKey,
  onActivate,
  onClose,
}: RuleTabsProps) => (
  <div
    role="tablist"
    className="flex h-full min-w-0 items-stretch overflow-x-auto"
  >
    {tabs.map((tab) => {
      const isActive = tab.key === activeKey;
      return (
        <div
          key={tab.key}
          role="tab"
          aria-current={isActive ? "true" : undefined}
          className={cn(
            "flex items-center border-r border-r-border text-sm",
            isActive
              ? "bg-background text-foreground"
              : "text-muted-foreground",
          )}
        >
          <button
            type="button"
            className="h-full max-w-40 truncate pl-3 pr-2"
            onClick={() => onActivate(tab.key)}
          >
            {tab.label}
          </button>
          {tab.isDirty ? (
            <span
              aria-label="Unsaved changes"
              className="mr-1 size-1.5 shrink-0 bg-current"
            />
          ) : null}
          <button
            type="button"
            aria-label={`Close ${tab.label}`}
            className="flex h-full items-center pr-2 text-muted-foreground hover:text-foreground"
            onClick={() => onClose(tab.key)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      );
    })}
  </div>
);
