import { Switch } from '../components/ui/switch';
import { useRules } from './RulesProvider';

export const GlobalSwitch = () => {
  const { globalEnabled, toggleGlobal } = useRules();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      <Switch
        aria-label="Global enabled"
        checked={globalEnabled}
        onChange={() => void toggleGlobal(!globalEnabled)}
      />
      <span className={globalEnabled ? 'text-foreground' : 'text-muted-foreground'}>
        {globalEnabled ? 'On' : 'Off'}
      </span>
    </label>
  );
};
