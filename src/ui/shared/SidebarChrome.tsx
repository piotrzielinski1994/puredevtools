import { GlobalSwitch } from "./GlobalSwitch";
import { ImportExportControls } from "./ImportExportControls";
import { ThemeSwitch } from "./ThemeSwitch";
import { useTheme } from "./useTheme";

export const SidebarChrome = () => {
  const [theme, setTheme] = useTheme();
  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b pl-3 text-sm font-semibold">
      puredevtools
      <div className="flex h-full items-center gap-3 pr-3">
        <ImportExportControls />
        <GlobalSwitch />
        <ThemeSwitch theme={theme} onChange={setTheme} />
      </div>
    </div>
  );
};
