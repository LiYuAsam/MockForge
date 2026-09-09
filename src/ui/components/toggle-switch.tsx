export function ToggleSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="toggle-switch">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
    <span className="toggle-switch__track" aria-hidden="true" />
    <span className="toggle-switch__label">{label}</span>
  </label>
}
