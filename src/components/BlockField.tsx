import { useId } from 'react'
import { COMMON_BLOCKS } from '../parametric/templates'

type Props = {
  label: string
  value: string
  onChange: (v: string) => void
}

export function BlockField({ label, value, onChange }: Props) {
  const listId = useId()
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} list={listId} spellCheck={false} />
      <datalist id={listId}>
        {COMMON_BLOCKS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </label>
  )
}

type NumProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}

export function NumField({ label, value, min, max, step = 1, onChange }: NumProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n / step) * step)))
        }}
      />
    </label>
  )
}
