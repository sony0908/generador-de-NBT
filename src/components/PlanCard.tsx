import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, RefreshCw } from 'lucide-react'
import { PLAN_LABELS, type PlanGrid, type PlanName, type PlanSet } from '../ai/plans'
import { blockColor, normalizeBlockName } from '../voxel/palette'
import { PlanEditor } from './PlanEditor'
import './PlanCard.css'

export function cellBlock(cell: string, palette: Record<string, string>): string | null {
  if (typeof cell !== 'string') return null
  const t = cell.trim()
  if (!t || t.toLowerCase() === 'air' || t.toLowerCase() === 'minecraft:air') return null
  if (Object.hasOwn(palette, t)) return normalizeBlockName(palette[t])
  return normalizeBlockName(t)
}

export function drawBlueprint(
  canvas: HTMLCanvasElement,
  plan: PlanGrid,
  palette: Record<string, string>,
) {
  const maxDim = Math.max(plan.w, plan.h, 1)
  const cell = Math.max(3, Math.min(14, Math.floor(340 / maxDim)))
  canvas.width = plan.w * cell
  canvas.height = plan.h * cell
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#0d2137'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < plan.h; y++) {
    for (let x = 0; x < plan.w; x++) {
      const block = cellBlock(plan.grid[y]?.[x] ?? 'air', palette)
      if (block) {
        ctx.fillStyle = blockColor(block)
        ctx.fillRect(x * cell, y * cell, cell, cell)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2)
      }
    }
  }
  ctx.strokeStyle = 'rgba(140,190,240,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= plan.w; x++) {
    ctx.moveTo(x * cell + 0.5, 0)
    ctx.lineTo(x * cell + 0.5, canvas.height)
  }
  for (let y = 0; y <= plan.h; y++) {
    ctx.moveTo(0, y * cell + 0.5)
    ctx.lineTo(canvas.width, y * cell + 0.5)
  }
  ctx.stroke()
}

type Props = {
  name: PlanName
  planSet: PlanSet
  accepted: boolean
  attempts: number
  busy: boolean
  onAccept: () => void
  onRegenerate: (note: string) => void
  onSaveEdit: (grid: string[][]) => void
}

export function PlanCard({ name, planSet, accepted, attempts, busy, onAccept, onRegenerate, onSaveEdit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const plan = planSet.plans[name]

  useEffect(() => {
    if (canvasRef.current && !editing) drawBlueprint(canvasRef.current, plan, planSet.palette)
  }, [plan, planSet.palette, editing])

  return (
    <div className={'plan-card' + (accepted ? ' accepted' : '')}>
      <div className="plan-head">
        <div>
          <strong>Plano {PLAN_LABELS[name]}</strong>
          <small>
            {plan.w}×{plan.h} celdas · intento {attempts} · {accepted ? 'aceptado' : 'pendiente'}
          </small>
        </div>
        <button
          type="button"
          className={'accept-btn' + (accepted ? ' on' : '')}
          onClick={onAccept}
          title={accepted ? 'Quitar aceptación' : 'Aceptar plano'}
        >
          <Check size={15} /> {accepted ? 'Aceptado' : 'Aceptar'}
        </button>
      </div>

      {editing ? (
        <PlanEditor
          plan={plan}
          palette={planSet.palette}
          onSave={(g) => { setEditing(false); onSaveEdit(g) }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <canvas ref={canvasRef} className="plan-canvas" />
      )}

      {!editing && (
        <>
          <div className="plan-legend">
            {Object.entries(planSet.palette).map(([alias, id]) => (
              <span key={alias} className="legend-chip">
                <i style={{ background: blockColor(normalizeBlockName(id) ?? id) }} />
                {alias}
              </span>
            ))}
            <span className="legend-chip"><i className="air" /> air</span>
          </div>
          <div className="plan-actions">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Corrección para regenerar (ej: la corona debe ser abierta)"
            />
            <div className="plan-buttons">
              <button type="button" className="ghost" disabled={busy} onClick={() => onRegenerate(note)}>
                <RefreshCw size={14} /> {busy ? 'Generando…' : 'Regenerar'}
              </button>
              <button type="button" className="ghost" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Editar celdas
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
