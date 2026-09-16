import type { BaseStyle, Building, RoofStyle } from '../parametric/types'
import { BASE_STYLES, FACADE_FACE_LABELS, FACADE_FACES, ROOF_STYLES } from '../parametric/types'
import { BlockField, NumField } from './BlockField'

type Props = {
  building: Building
  update: (patch: Partial<Building>) => void
}

export function BaseRoofStep({ building, update }: Props) {
  const b = building.base
  const r = building.roof
  return (
    <div>
      <h4 className="subhead">Base / primer piso</h4>
      <div className="step-grid">
        <NumField label="Altura de la base" value={b.height} min={0} max={8} onChange={(height) => update({ base: { ...b, height } })} />
        <label className="field">
          <span>Plantilla de base</span>
          <select value={b.style} onChange={(e) => update({ base: { ...b, style: e.target.value as BaseStyle } })}>
            {BASE_STYLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label} — {s.hint}</option>
            ))}
          </select>
        </label>
        <BlockField label="Muro de base" value={b.wall} onChange={(wall) => update({ base: { ...b, wall } })} />
        {(b.style === 'retail_glass' || b.style === 'entrance') && (
          <>
            <BlockField label="Vidrio de base" value={b.glass} onChange={(glass) => update({ base: { ...b, glass } })} />
            <label className="field">
              <span>Cara de la entrada</span>
              <select value={b.entranceFace} onChange={(e) => update({ base: { ...b, entranceFace: e.target.value as typeof b.entranceFace } })}>
                {FACADE_FACES.map((f) => (
                  <option key={f} value={f}>{FACADE_FACE_LABELS[f]}</option>
                ))}
              </select>
            </label>
            <NumField label="Ancho de entrada" value={b.entranceW} min={1} max={9} onChange={(entranceW) => update({ base: { ...b, entranceW } })} />
          </>
        )}
      </div>

      <h4 className="subhead">Techo / corona</h4>
      <div className="step-grid">
        <label className="field">
          <span>Plantilla de techo</span>
          <select value={r.style} onChange={(e) => update({ roof: { ...r, style: e.target.value as RoofStyle } })}>
            {ROOF_STYLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label} — {s.hint}</option>
            ))}
          </select>
        </label>
        {r.style === 'open_frame' && (
          <NumField label="Altura de la corona" value={r.height} min={1} max={6} onChange={(height) => update({ roof: { ...r, height } })} />
        )}
        <BlockField label="Remate (cornisa/marco)" value={r.trim} onChange={(trim) => update({ roof: { ...r, trim } })} />
        {r.style === 'flat_slab' && (
          <BlockField label="Losa de azotea" value={r.slab} onChange={(slab) => update({ roof: { ...r, slab } })} />
        )}
      </div>
    </div>
  )
}
