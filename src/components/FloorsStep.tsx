import type { Building } from '../parametric/types'
import { BlockField, NumField } from './BlockField'

type Props = {
  building: Building
  update: (patch: Partial<Building>) => void
}

export function FloorsStep({ building, update }: Props) {
  const f = building.floors
  return (
    <div className="step-grid">
      <NumField label="Cantidad de pisos" value={f.count} min={1} max={60} onChange={(count) => update({ floors: { ...f, count } })} />
      <label className="field">
        <span>Espacio entre pisos (alto de cada piso)</span>
        <select value={f.floorHeight} onChange={(e) => update({ floors: { ...f, floorHeight: Number(e.target.value) as 2 | 3 | 4 | 5 } })}>
          <option value={2}>2 bloques (enano)</option>
          <option value={3}>3 bloques (estándar)</option>
          <option value={4}>4 bloques (alto)</option>
          <option value={5}>5 bloques (palaciego)</option>
        </select>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={f.slab} onChange={() => update({ floors: { ...f, slab: !f.slab } })} />
        Piso entre plantas
      </label>
      {f.slab && (
        <>
          <BlockField label="Material de piso (losa o bloque)" value={f.slabBlock} onChange={(slabBlock) => update({ floors: { ...f, slabBlock } })} />
          <label className="toggle">
            <input type="checkbox" checked={f.inset} onChange={() => update({ floors: { ...f, inset: !f.inset } })} />
            Solo por dentro (no en el contorno)
          </label>
        </>
      )}
      <small className="ai-hint">
        Si los pisos pedidos no caben en un volumen, se construyen los que quepan y se avisa cuántos faltan.
      </small>
    </div>
  )
}
