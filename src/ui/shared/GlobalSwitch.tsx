import { Switch } from '../components/ui/switch';
import { useRules } from './RulesProvider';

export const GlobalSwitch = () => {
  const { globalEnabled, toggleGlobal } = useRules();
  return (
    <Switch
      aria-label="Global enabled"
      checked={globalEnabled}
      onChange={() => void toggleGlobal(!globalEnabled)}
    />
  );
};
