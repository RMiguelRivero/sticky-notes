import './SnapToggle.css'

type Props = {
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}

export function SnapToggle({ checked, onChange }: Props) {
  return (
    <label className="snap-toggle">
      Snap
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}
