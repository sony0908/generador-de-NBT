import { useEffect, useRef, useState } from 'react'
import type { PlanGrid } from '../ai/plans'
import { blockColor, normalizeBlockName } from '../voxel/palette'
import { cellBlock, drawBlueprint } from './PlanCard'

type Props = {
  plan: PlanGrid
  palette: Record<string, string>
  onSave: (grid: string[][]) => void
  onCancel: () => void
}

// Editor mínimo: clic/pincel pinta celdas con el alias elegido (o air).
export function PlanEditor({ plan, palette, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [draft, setDraft] = useState<string[][]>(() => plan.grid.map((r) => [...r]))
  const [brush, setBrush] = useState<string>(() => Object.keys(palette)[0] ?? 'air')
  const [painting, setPainting] = useState(false)
  const aliases = ['air', ...Object.keys(palette)]

  useEffect(() => {
    if (canvasRef.current) {
      drawBlueprint(canvasRef.current, { w: plan.w, h: plan.h, grid: draft }, palette)
    }
  }, [draft, plan.w, plan.h, palette])

  const paintAt = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / (canvas.width / plan.w))
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / (canvas.height / plan.h))
    if (x < 0 || y < 0 || x >= plan.w || y >= plan.h) return
    setDraft((d) => {
      const next = d.map((r) => [...r])
      next[y][x] = brush
      return next
    })
  }

  return (
    <div className="plan-editor">
      <div className="brush-row">
        {aliases.map((a) => {
          const block = a === 'air' ? null : cellBlock(a, palette)
          return (
            <button
              key={a}
              type="button"
              className={'brush' + (brush === a ? ' on' : '')}
              onClick={() => setBrush(a)}
              title={a === 'air' ? 'air (vacío)' : `${a} → ${palette[a]}`}
            >
              <i style={{ background: block ? blockColor(block) : 'transparent' }} />
              {a}
            </button>
          )
        })}
      </div>
      <canvas
        ref={canvasRef}
        className="plan-canvas editing"
        onMouseDown={(e) => { setPainting(true); paintAt(e) }}
        onMouseMove={(e) => { if (painting) paintAt(e) }}
        onMouseUp={() => setPainting(false)}
        onMouseLeave={() => setPainting(false)}
      />
      <div className="plan-buttons">
        <button type="button" className="primary" onClick={() => onSave(draft)}>Guardar edición</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
      <small className="ai-hint">Pincel: {brush === 'air' ? 'vacío' : `${brush} → ${palette[brush] ?? normalizeBlockName(brush)}`}</small>
    </div>
  )
}
