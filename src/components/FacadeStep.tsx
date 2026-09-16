import { useState } from 'react'
import type { Building, FacadeFace, FacadeFaceName, FacadePattern } from '../parametric/types'
import { FACADE_FACES, FACADE_FACE_LABELS } from '../parametric/types'
import {
  BUILTIN_FACADE_TEMPLATES,
  deleteUserTemplate,
  loadUserTemplates,
  saveUserTemplate,
} from '../parametric/templates'
import { BlockField, NumField } from './BlockField'

type Props = {
  building: Building
  update: (patch: Partial<Building>) => void
}

const PATTERNS: { id: FacadePattern; label: string }[] = [
  { id: 'punched_grid', label: 'Ventanas en cuadrícula' },
  { id: 'ribbon', label: 'Tira continua (ribbon)' },
  { id: 'solid', label: 'Muro ciego' },
]

export function FacadeStep({ building, update }: Props) {
  const [face, setFace] = useState<FacadeFaceName>('front')
  const [tplName, setTplName] = useState('')
  const [userTpls, setUserTpls] = useState(loadUserTemplates)
  const current = building.facade[face]

  const setFacePatch = (patch: Partial<FacadeFace>) => {
    update({ facade: { ...building.facade, [face]: { ...current, ...patch } } })
  }

  const copyToAll = () => {
    update({ facade: { front: { ...current }, back: { ...current }, left: { ...current }, right: { ...current } } })
  }

  const applyTemplate = (tpl: FacadeFace, toAll: boolean) => {
    if (toAll) {
      update({ facade: { front: { ...tpl }, back: { ...tpl }, left: { ...tpl }, right: { ...tpl } } })
    } else {
      update({ facade: { ...building.facade, [face]: { ...tpl } } })
    }
  }

  return (
    <div>
      <div className="ai-tabs">
        {FACADE_FACES.map((f) => (
          <button key={f} type="button" className={'ai-tab' + (face === f ? ' active' : '')} onClick={() => setFace(f)}>
            {FACADE_FACE_LABELS[f]}
          </button>
        ))}
        <button type="button" className="ghost" onClick={copyToAll} title="Aplica la cara actual a las 4 caras">
          Copiar a todas
        </button>
      </div>

      <div className="step-grid">
        <label className="field">
          <span>Plantilla de la cara {FACADE_FACE_LABELS[face]}</span>
          <select
            value={current.pattern}
            onChange={(e) => setFacePatch({ pattern: e.target.value as FacadePattern })}
          >
            {PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        {current.pattern === 'punched_grid' && (
          <>
            <NumField label="Cantidad: ancho de ventana" value={current.windowW} min={1} max={8} onChange={(windowW) => setFacePatch({ windowW })} />
            <NumField label="Espacio entre ventanas" value={current.gapX} min={0} max={8} onChange={(gapX) => setFacePatch({ gapX })} />
          </>
        )}
        {current.pattern !== 'solid' && (
          <NumField label="Altura de antepecho (filas de muro sobre la losa)" value={current.sill} min={0} max={4} onChange={(sill) => setFacePatch({ sill })} />
        )}
        <BlockField label="Muro" value={current.wall} onChange={(wall) => setFacePatch({ wall })} />
        {current.pattern !== 'solid' && (
          <BlockField label="Vidrio" value={current.glass} onChange={(glass) => setFacePatch({ glass })} />
        )}
      </div>

      {current.pattern === 'punched_grid' && (
        <WindowPixelEditor
          face={current}
          floorH={building.floors.floorHeight}
          onChange={(custom) => setFacePatch({ custom })}
        />
      )}

      <h4 className="subhead">Plantillas listas</h4>
      <div className="tpl-grid">
        {BUILTIN_FACADE_TEMPLATES.map((t) => (
          <div key={t.name} className="tpl-card">
            <strong>{t.name}</strong>
            <small>{t.face.pattern === 'solid' ? 'Muro ciego' : t.face.pattern === 'ribbon' ? 'Tira continua' : `Ventana ${t.face.windowW} · espacio ${t.face.gapX}`}</small>
            <div className="plan-buttons">
              <button type="button" className="ghost" onClick={() => applyTemplate(t.face, false)}>A esta cara</button>
              <button type="button" className="ghost" onClick={() => applyTemplate(t.face, true)}>A todas</button>
            </div>
          </div>
        ))}
      </div>

      <h4 className="subhead">Mis plantillas</h4>
      <div className="tpl-save">
        <input type="text" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Nombre (ej: mi torre)" />
        <button
          type="button"
          className="ghost"
          onClick={() => {
            saveUserTemplate(tplName || `Plantilla ${userTpls.length + 1}`, current)
            setUserTpls(loadUserTemplates())
            setTplName('')
          }}
        >
          Guardar cara actual
        </button>
      </div>
      {userTpls.length === 0 ? (
        <small className="ai-hint">Aún no guardaste plantillas propias. Se guardan en este navegador.</small>
      ) : (
        <div className="tpl-grid">
          {userTpls.map((t) => (
            <div key={t.name} className="tpl-card">
              <strong>{t.name}</strong>
              {t.face.custom?.length ? <small>Diseño de ventana personalizado</small> : null}
              <div className="plan-buttons">
                <button type="button" className="ghost" onClick={() => applyTemplate(t.face, false)}>A esta cara</button>
                <button type="button" className="ghost" onClick={() => applyTemplate(t.face, true)}>A todas</button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => {
                    deleteUserTemplate(t.name)
                    setUserTpls(loadUserTemplates())
                  }}
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type PxCell = 'G' | 'W' | '.'

function WindowPixelEditor({
  face,
  floorH,
  onChange,
}: {
  face: FacadeFace
  floorH: number
  onChange: (custom: string[][] | null) => void
}) {
  const [brush, setBrush] = useState<PxCell>('G')
  const [painting, setPainting] = useState(false)
  const rows = Math.max(1, Math.min(5, floorH - face.sill))
  const cols = Math.max(1, Math.min(8, face.windowW))

  const grid: string[][] = []
  for (let y = 0; y < rows; y++) {
    const row: string[] = []
    for (let x = 0; x < cols; x++) {
      row.push(face.custom?.[y]?.[x] ?? 'G')
    }
    grid.push(row)
  }

  const paint = (x: number, y: number) => {
    const next = grid.map((r) => [...r])
    next[y][x] = brush
    onChange(next)
  }

  if (!face.custom) {
    return (
      <div className="px-wrap">
        <small className="ai-hint">
          Ventana maciza de vidrio ({cols}×{rows}). Personalízala celda por celda:
        </small>
        <div className="plan-buttons">
          <button
            type="button"
            className="ghost"
            onClick={() => onChange(grid)}
          >
            Personalizar ventana
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-wrap">
      <small className="ai-hint">
        Diseña la ventana ({cols}×{rows}): se repite en cada hueco de esta cara.
      </small>
      <div className="brush-row">
        {(['G', 'W', '.'] as const).map((b) => (
          <button
            key={b}
            type="button"
              className={'brush ' + (b === '.' ? 'px-brush-dot' : 'px-brush-' + b) + (brush === b ? ' on' : '')}
            onClick={() => setBrush(b)}
          >
            {b === 'G' ? 'Vidrio' : b === 'W' ? 'Muro' : 'No tocar'}
          </button>
        ))}
      </div>
      <div
        className="px-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 30px)` }}
        onMouseLeave={() => setPainting(false)}
        onMouseUp={() => setPainting(false)}
      >
        {grid.map((row, y) =>
          row.map((cell, x) => (
            <button
              key={x + '-' + y}
              type="button"
              className={'px-cell px-' + (cell === 'G' || cell === 'W' ? cell : 'dot')}
              onMouseDown={(e) => {
                e.preventDefault()
                setPainting(true)
                paint(x, y)
              }}
              onMouseEnter={() => {
                if (painting) paint(x, y)
              }}
              title={`Fila ${y + 1}, col ${x + 1}`}
            />
          )),
        )}
      </div>
      <div className="plan-buttons">
        <button type="button" className="ghost" onClick={() => onChange(null)}>
          Volver a vidrio macizo
        </button>
      </div>
    </div>
  )
}
