import { Armchair } from 'lucide-react'
import type { InteriorOptions } from '../voxel/interior'

type Props = {
  opts: InteriorOptions
  setOpts: (o: InteriorOptions) => void
  floorYsText: string
  setFloorYsText: (t: string) => void
  disabled: boolean
  applying: boolean
  onApply: () => void
}

export function InteriorPanel({ opts, setOpts, floorYsText, setFloorYsText, disabled, applying, onApply }: Props) {
  const toggle = (key: 'floors' | 'stairs' | 'lighting' | 'furnish') => setOpts({ ...opts, [key]: !opts[key] })
  return (
    <section className="card">
      <div className="card-head">
        <span className="icon"><Armchair size={20} /></span>
        <div>
          <span className="eyebrow">Paso 4 — Interior editable</span>
          <h2>Añade detalles sin tocar la fachada</h2>
          <p>Se aplican sobre la base ya construida: pisos, escaleras, iluminación y amoblado básico.</p>
        </div>
      </div>
      <div className="toggles">
        {(['floors', 'stairs', 'lighting', 'furnish'] as const).map((k) => (
          <label key={k} className="toggle">
            <input type="checkbox" checked={opts[k]} disabled={disabled} onChange={() => toggle(k)} />
            {k === 'floors' ? 'Pisos' : k === 'stairs' ? 'Escaleras' : k === 'lighting' ? 'Iluminación' : 'Amoblado'}
          </label>
        ))}
      </div>
      <label className="field">
        <span>Niveles de piso (Y, separados por coma)</span>
        <input type="text" value={floorYsText} disabled={disabled} onChange={(e) => setFloorYsText(e.target.value)} placeholder="3, 6, 9, 12" />
      </label>
      <button className="primary" type="button" disabled={disabled || applying} onClick={onApply}>
        {applying ? 'Aplicando…' : 'Aplicar interior al visor'}
      </button>
    </section>
  )
}
