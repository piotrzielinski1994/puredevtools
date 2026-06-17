import { useRules } from './RulesProvider';

export const GlobalSwitch = () => {
  const { globalEnabled, toggleGlobal } = useRules();
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        type="checkbox"
        role="switch"
        aria-label="Global enabled"
        checked={globalEnabled}
        onChange={() => void toggleGlobal(!globalEnabled)}
      />
      <span>{globalEnabled ? 'On' : 'Off'}</span>
    </label>
  );
};
