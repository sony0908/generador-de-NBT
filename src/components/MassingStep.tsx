import { useEffect, useRef, useState } from 'react'
import { Copy, Cuboid, Plus, Trash2 } from 'lucide-react'
import type { Building, Volume } from '../parametric/types'
import { newVolumeId } from '../parametric/types'
import { NumField } from './BlockField'
import './MassingStep.css'

type Props = {
  building: Building
  update: (patch: Partial<Building>) => void
}

function patchVolume(b: Building, id: string, patch: Partial<Volume>): Volume[] {
  return b.volumes.map((v) => (v.id === id ? { ...v, ...patch } : v))
}

export function MassingStep({ building, update }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<string>(building.volumes[0]?.id ?? '')
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ dx: 0, dz: 0 })

  const sel = building.volumes.find((v) => v.id === selected) ?? building.volumes[0]

  useEffect(() => {
    if (!building.volumes.some((v) => v.id === selected) && building.volumes.length) {
      setSelected(building.volumes[0].id)
    }
  }, [building.volumes, selected])

  // Vista cenital 2D: cada cubo es un rectángulo arrastrable.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const maxX = Math.max(8, ...building.volumes.map((v) => Math.max(v.from[0], v.to[0]) + 1))
    const maxZ = Math.max(8, ...building.volumes.map((v) => Math.max(v.from[2], v.to[2]) + 1))
    const cell = Math.max(6, Math.min(26, Math.floor(380 / Math.max(maxX, maxZ))))
    canvas.width = maxX * cell + 8
    canvas.height = maxZ * cell + 8
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#0b0f14'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = 'rgba(140,190,240,0.12)'
    ctx.beginPath()
    for (let x = 0; x <= maxX; x++) {
      ctx.moveTo(x * cell + 4.5, 4)
      ctx.lineTo(x * cell + 4.5, canvas.height - 4)
    }
    for (let z = 0; z <= maxZ; z++) {
      ctx.moveTo(4, z * cell + 4.5)
      ctx.lineTo(canvas.width - 4, z * cell + 4.5)
    }
    ctx.stroke()
    building.volumes.forEach((v, i) => {
      const x0 = Math.min(v.from[0], v.to[0])
      const z0 = Math.min(v.from[2], v.to[2])
      const w = Math.abs(v.to[0] - v.from[0]) + 1
      const d = Math.abs(v.to[2] - v.from[2]) + 1
      const h = Math.abs(v.to[1] - v.from[1]) + 1
      const isSel = v.id === (sel?.id ?? selected)
      ctx.fillStyle = isSel ? 'rgba(88,166,255,0.45)' : `rgba(88,166,255,${0.14 + (i % 4) * 0.05})`
      ctx.fillRect(x0 * cell + 4, z0 * cell + 4, w * cell, d * cell)
      ctx.strokeStyle = isSel ? '#58a6ff' : 'rgba(140,190,240,0.5)'
      ctx.lineWidth = isSel ? 2 : 1
      ctx.strokeRect(x0 * cell + 4, z0 * cell + 4, w * cell, d * cell)
      ctx.fillStyle = '#dbe7f3'
      ctx.font = `${Math.max(10, Math.min(13, cell - 4))}px system-ui`
      ctx.fillText(`${v.name} · h${h}`, x0 * cell + 8, z0 * cell + 18)
    })
  }, [building.volumes, sel, selected])

  const cellOf = () => {
    const canvas = canvasRef.current
    if (!canvas) return 10
    const maxX = Math.max(8, ...building.volumes.map((v) => Math.max(v.from[0], v.to[0]) + 1))
    const maxZ = Math.max(8, ...building.volumes.map((v) => Math.max(v.from[2], v.to[2]) + 1))
    return Math.max(6, Math.min(26, Math.floor(380 / Math.max(maxX, maxZ))))
  }

  const posOf = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const cell = cellOf()
    const gx = Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width) - 4) / cell)
    const gz = Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height) - 4) / cell)
    return { gx, gz, cell }
  }

  const onDown = (e: React.MouseEvent) => {
    const { gx, gz } = posOf(e)
    const hit = [...building.volumes].reverse().find((v) => {
      const x0 = Math.min(v.from[0], v.to[0])
      const x1 = Math.max(v.from[0], v.to[0])
      const z0 = Math.min(v.from[2], v.to[2])
      const z1 = Math.max(v.from[2], v.to[2])
      return gx >= x0 && gx <= x1 && gz >= z0 && gz <= z1
    })
    if (hit) {
      setSelected(hit.id)
      dragOffset.current = { dx: gx - Math.min(hit.from[0], hit.to[0]), dz: gz - Math.min(hit.from[2], hit.to[2]) }
      setDragging(true)
    }
  }

  const onMove = (e: React.MouseEvent) => {
    if (!dragging || !sel) return
    const { gx, gz } = posOf(e)
    const w = Math.abs(sel.to[0] - sel.from[0])
    const d = Math.abs(sel.to[2] - sel.from[2])
    const nx0 = Math.max(0, gx - dragOffset.current.dx)
    const nz0 = Math.max(0, gz - dragOffset.current.dz)
    update({
      volumes: patchVolume(building, sel.id, {
        from: [nx0, sel.from[1], nz0],
        to: [nx0 + w, sel.to[1], nz0 + d],
      }),
    })
  }

  const addVolume = () => {
    const id = newVolumeId()
    const off = building.volumes.length * 2
    update({
      volumes: [
        ...building.volumes,
        { id, name: `Anexo ${building.volumes.length + 1}`, from: [off, 0, 0], to: [off + 6, 11, 6] },
      ],
    })
    setSelected(id)
  }

  const duplicateSelected = () => {
    if (!sel) return
    const id = newVolumeId()
    update({
      volumes: [
        ...building.volumes,
        { ...sel, id, name: sel.name + ' copia', from: [sel.from[0] + 2, sel.from[1], sel.from[2]], to: [sel.to[0] + 2, sel.to[1], sel.to[2]] },
      ],
    })
    setSelected(id)
  }

  return (
    <div className="massing">
      <div className="massing-list">
        <div className="massing-list-head">
          <span>Volúmenes ({building.volumes.length})</span>
          <button type="button" className="ghost" onClick={addVolume}>
            <Plus size={14} /> Cubo
          </button>
        </div>        {building.volumes.map((v) => (
          <button
            key={v.id}
            type="button"
            className={'vol-item' + (v.id === sel?.id ? ' on' : '')}
            onClick={() => setSelected(v.id)}
          >
            <Cuboid size={14} /> {v.name}
            <small>
              {Math.abs(v.to[0] - v.from[0]) + 1}×{Math.abs(v.to[1] - v.from[1]) + 1}×{Math.abs(v.to[2] - v.from[2]) + 1}
            </small>
          </button>
        ))}
        <label className="toggle union-toggle">
          <input
            type="checkbox"
            checked={building.hollowUnion}
            onChange={() => update({ hollowUnion: !building.hollowUnion })}
          />
          Quitar paredes internas donde se pegan
        </label>
      </div>

      <div className="massing-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="massing-canvas"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
        />
        <small className="ai-hint">Clic para seleccionar · arrastra para mover</small>
      </div>

      {sel && (
        <div className="massing-form">
          <label className="field">
            <span>Nombre</span>
            <input type="text" value={sel.name} onChange={(e) => update({ volumes: patchVolume(building, sel.id, { name: e.target.value }) })} />
          </label>
          <div className="grid2">
            <NumField label="X" value={Math.min(sel.from[0], sel.to[0])} min={0} max={64} onChange={(n) => {
              const w = Math.abs(sel.to[0] - sel.from[0])
              update({ volumes: patchVolume(building, sel.id, { from: [n, sel.from[1], sel.from[2]], to: [n + w, sel.to[1], sel.to[2]] }) })
            }} />
            <NumField label="Z" value={Math.min(sel.from[2], sel.to[2])} min={0} max={64} onChange={(n) => {
              const d = Math.abs(sel.to[2] - sel.from[2])
              update({ volumes: patchVolume(building, sel.id, { from: [sel.from[0], sel.from[1], n], to: [sel.to[0], sel.to[1], n + d] }) })
            }} />
            <NumField label="Ancho" value={Math.abs(sel.to[0] - sel.from[0]) + 1} min={1} max={64} onChange={(n) => {
              const x0 = Math.min(sel.from[0], sel.to[0])
              update({ volumes: patchVolume(building, sel.id, { from: [x0, sel.from[1], sel.from[2]], to: [x0 + n - 1, sel.to[1], sel.to[2]] }) })
            }} />
            <NumField label="Fondo" value={Math.abs(sel.to[2] - sel.from[2]) + 1} min={1} max={64} onChange={(n) => {
              const z0 = Math.min(sel.from[2], sel.to[2])
              update({ volumes: patchVolume(building, sel.id, { from: [sel.from[0], sel.from[1], z0], to: [sel.to[0], sel.to[1], z0 + n - 1] }) })
            }} />
            <NumField label="Base Y" value={Math.min(sel.from[1], sel.to[1])} min={0} max={320} onChange={(n) => {
              const h = Math.abs(sel.to[1] - sel.from[1])
              update({ volumes: patchVolume(building, sel.id, { from: [sel.from[0], n, sel.from[2]], to: [sel.to[0], n + h, sel.to[2]] }) })
            }} />
            <NumField label="Alto" value={Math.abs(sel.to[1] - sel.from[1]) + 1} min={1} max={384} onChange={(n) => {
              const y0 = Math.min(sel.from[1], sel.to[1])
              update({ volumes: patchVolume(building, sel.id, { from: [sel.from[0], y0, sel.from[2]], to: [sel.to[0], y0 + n - 1, sel.to[2]] }) })
            }} />
          </div>
          <div className="plan-buttons">
            <button type="button" className="ghost" onClick={duplicateSelected}>
              <Copy size={14} /> Duplicar
            </button>
            <button
              type="button"
              className="ghost danger"
              disabled={building.volumes.length <= 1}
              onClick={() => update({ volumes: building.volumes.filter((v) => v.id !== sel.id) })}
            >
              <Trash2 size={14} /> Quitar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
