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

// Volumetría = FORMA en tramos (proporción y adosamiento, no bloques).
// Las medidas reales las dan Pisos (altura) y Fachada (ancho simétrico).
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

  // Vista cenital 2D en tramos: cada cubo es un rectángulo arrastrable.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const maxX = Math.max(8, ...building.volumes.map((v) => v.x + v.w))
    const maxZ = Math.max(8, ...building.volumes.map((v) => v.z + v.d))
    const cell = Math.max(10, Math.min(30, Math.floor(380 / Math.max(maxX, maxZ))))
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
      const isSel = v.id === (sel?.id ?? selected)
      ctx.fillStyle = isSel ? 'rgba(88,166,255,0.45)' : `rgba(88,166,255,${0.14 + (i % 4) * 0.05})`
      ctx.fillRect(v.x * cell + 4, v.z * cell + 4, v.w * cell, v.d * cell)
      ctx.strokeStyle = isSel ? '#58a6ff' : 'rgba(140,190,240,0.5)'
      ctx.lineWidth = isSel ? 2 : 1
      ctx.strokeRect(v.x * cell + 4, v.z * cell + 4, v.w * cell, v.d * cell)
      ctx.fillStyle = '#dbe7f3'
      ctx.font = `${Math.max(10, Math.min(13, cell - 2))}px system-ui`
      ctx.fillText(`${v.name} · ${Math.round(v.hShare * 100)}%`, v.x * cell + 8, v.z * cell + 18)
    })
  }, [building.volumes, sel, selected])

  const cellOf = () => {
    const maxX = Math.max(8, ...building.volumes.map((v) => v.x + v.w))
    const maxZ = Math.max(8, ...building.volumes.map((v) => v.z + v.d))
    return Math.max(10, Math.min(30, Math.floor(380 / Math.max(maxX, maxZ))))
  }

  const posOf = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const cell = cellOf()
    const gx = Math.floor(((e.clientX - rect.left) * (canvas.width / rect.width) - 4) / cell)
    const gz = Math.floor(((e.clientY - rect.top) * (canvas.height / rect.height) - 4) / cell)
    return { gx, gz }
  }

  const onDown = (e: React.MouseEvent) => {
    const { gx, gz } = posOf(e)
    const hit = [...building.volumes].reverse().find(
      (v) => gx >= v.x && gx < v.x + v.w && gz >= v.z && gz < v.z + v.d,
    )
    if (hit) {
      setSelected(hit.id)
      dragOffset.current = { dx: gx - hit.x, dz: gz - hit.z }
      setDragging(true)
    }
  }

  const onMove = (e: React.MouseEvent) => {
    if (!dragging || !sel) return
    const { gx, gz } = posOf(e)
    update({
      volumes: patchVolume(building, sel.id, {
        x: Math.max(0, gx - dragOffset.current.dx),
        z: Math.max(0, gz - dragOffset.current.dz),
      }),
    })
  }

  const addVolume = () => {
    const id = newVolumeId()
    const off = building.volumes.length * 2
    update({
      volumes: [
        ...building.volumes,
        { id, name: `Anexo ${building.volumes.length + 1}`, x: off, z: 0, w: 4, d: 4, yShare: 0, hShare: 0.4, grounded: true, gableDir: 'x' },
      ],
    })
    setSelected(id)
  }

  const duplicateSelected = () => {
    if (!sel) return
    const id = newVolumeId()
    update({
      volumes: [...building.volumes, { ...sel, id, name: sel.name + ' copia', x: sel.x + 1 }],
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
        </div>
        {building.volumes.map((v) => (
          <button
            key={v.id}
            type="button"
            className={'vol-item' + (v.id === sel?.id ? ' on' : '')}
            onClick={() => setSelected(v.id)}
          >
            <Cuboid size={14} /> {v.name}
            <small>{v.w}×{v.d} · {Math.round(v.hShare * 100)}%</small>
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
        <small className="ai-hint">Tramos = forma, no bloques. Clic para seleccionar · arrastra para mover.</small>
      </div>

      {sel && (
        <div className="massing-form">
          <label className="field">
            <span>Nombre</span>
            <input type="text" value={sel.name} onChange={(e) => update({ volumes: patchVolume(building, sel.id, { name: e.target.value }) })} />
          </label>
          <div className="grid2">
            <NumField label="X (tramos)" value={sel.x} min={0} max={4096} onChange={(x) => update({ volumes: patchVolume(building, sel.id, { x }) })} />
            <NumField label="Z (tramos)" value={sel.z} min={0} max={4096} onChange={(z) => update({ volumes: patchVolume(building, sel.id, { z }) })} />
            <NumField label="Ancho (tramos)" value={sel.w} min={1} max={4096} onChange={(w) => update({ volumes: patchVolume(building, sel.id, { w }) })} />
            <NumField label="Fondo (tramos)" value={sel.d} min={1} max={4096} onChange={(d) => update({ volumes: patchVolume(building, sel.id, { d }) })} />
            <NumField label="Altura (% del fuste)" value={Math.round(sel.hShare * 100)} min={5} max={100} onChange={(n) => update({ volumes: patchVolume(building, sel.id, { hShare: n / 100 }) })} />
            <NumField label="Inicio (% del fuste)" value={Math.round(sel.yShare * 100)} min={0} max={100} onChange={(n) => update({ volumes: patchVolume(building, sel.id, { yShare: n / 100 }) })} />
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={sel.grounded}
              onChange={() => update({ volumes: patchVolume(building, sel.id, { grounded: !sel.grounded }) })}
            />
            Nace del suelo
          </label>
          <label className="field">
            <span>Cumbrera dos aguas</span>
            <select value={sel.gableDir} onChange={(e) => update({ volumes: patchVolume(building, sel.id, { gableDir: e.target.value as 'x' | 'z' }) })}>
              <option value="x">Eje X (reduce a los lados)</option>
              <option value="z">Eje Z (reduce al frente/fondo)</option>
            </select>
          </label>
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
