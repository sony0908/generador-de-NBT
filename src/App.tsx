import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Boxes, Cuboid, DoorOpen, Download, Layers, Paintbrush } from 'lucide-react'
import { validateRecipe } from './ai/schema'
import { interpretRecipe, countBlocks } from './voxel/interpreter'
import { gridToNbt, placementGuide, type NbtPart } from './voxel/nbt'
import { gridToViewer } from './voxel/viewer'
import type { ViewerModel } from './generator/viewerTypes'
import { compileBuilding, carveEnclosed } from './parametric/compiler'
import { defaultBuilding, type Building } from './parametric/types'
import { MassingStep } from './components/MassingStep'
import { FloorsStep } from './components/FloorsStep'
import { FacadeStep } from './components/FacadeStep'
import { BaseRoofStep } from './components/BaseRoofStep'
import './App.css'

const MinecraftStructureViewer = lazy(async () => {
  const module = await import('./components/MinecraftStructureViewer')
  return { default: module.MinecraftStructureViewer }
})

const STEPS = [
  { label: 'Volumetría', icon: Cuboid },
  { label: 'Pisos', icon: Layers },
  { label: 'Fachada', icon: Paintbrush },
  { label: 'Base y techo', icon: DoorOpen },
] as const

export default function App() {
  const [step, setStep] = useState(0)
  const [building, setBuilding] = useState<Building>(defaultBuilding)
  const [viewerAssetFile, setViewerAssetFile] = useState<File | null>(null)
  const viewerAssetInputRef = useRef<HTMLInputElement>(null)

  const [parts, setParts] = useState<NbtPart[]>([])
  const [palette, setPalette] = useState<string[]>([])
  const [removed, setRemoved] = useState<{ name: string; count: number }[]>([])
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const update = (patch: Partial<Building>) => {
    setBuilding((b) => ({ ...b, ...patch }))
    setParts([])
  }

  // Compilación en vivo: Building → shell_ops → grid → visor.
  const compiled = useMemo(() => {
    try {
      const { recipe, warnings } = compileBuilding(building)
      const validation = validateRecipe(recipe)
      if (!validation.ok) return { ok: false as const, errors: validation.errors, warnings }
      const { grid, size, errors } = interpretRecipe(recipe)
      const allWarnings = [...warnings, ...validation.warnings, ...errors]
      if (building.hollowUnion) {
        const carved = carveEnclosed(grid, size)
        if (carved > 0) allWarnings.push(`Paredes internas eliminadas: ${carved} bloques.`)
      }
      return { ok: true as const, grid, size, warnings: allWarnings }
    } catch (e) {
      return { ok: false as const, errors: [e instanceof Error ? e.message : 'Diseño inválido.'], warnings: [] as string[] }
    }
  }, [building])

  const viewer: ViewerModel | null = useMemo(
    () => (compiled.ok ? gridToViewer(compiled.grid, compiled.size) : null),
    [compiled],
  )

  const summary = useMemo(() => {
    if (!compiled.ok) return ''
    const n = countBlocks(compiled.grid)
    const [sx, sy, sz] = compiled.size
    return `${sx}×${sy}×${sz} · ${building.volumes.length} volumen(es) · ${n.toLocaleString('es')} bloques`
  }, [compiled, building.volumes.length])

  const exportNbt = async () => {
    if (!compiled.ok) return
    setExporting(true)
    setError('')
    try {
      const result = await gridToNbt(compiled.grid, compiled.size)
      setParts(result.parts)
      setPalette(result.palette)
      setRemoved(result.removed)
      result.parts.forEach((p) => {
        const blob = new Blob([p.bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.parts.length > 1 ? `edificio_parte_${p.index}.nbt` : 'edificio.nbt'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      })
      if (result.multiPart) {
        const guide = placementGuide(result.parts)
        const blob = new Blob([guide], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'colocacion.txt'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
      setNotice(
        `${result.totalBlocks} bloques en ${result.parts.length} archivo(s).` +
          (result.removed.length ? ` No vanilla omitidos: ${result.removed.map((r) => `${r.name}×${r.count}`).join(', ')}.` : ''),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar el NBT.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="studio">
      <header className="studio-top">
        <div className="brand">
          <Boxes size={22} />
          <div>
            <strong>Generador de edificios</strong>
            <small>{summary || 'Diseño inválido'}</small>
          </div>
        </div>
        <div className="top-actions">
          <button type="button" className="ghost" onClick={() => viewerAssetInputRef.current?.click()} title={viewerAssetFile ? viewerAssetFile.name : 'Ver texturas reales'}>
            {viewerAssetFile ? 'Jar ✓' : 'client.jar'}
          </button>
          <input
            ref={viewerAssetInputRef}
            type="file"
            accept=".jar,.zip"
            className="visually-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) setViewerAssetFile(f)
            }}
          />
          <button className="primary" type="button" disabled={!compiled.ok || exporting} onClick={exportNbt}>
            <Download size={15} /> {exporting ? 'Exportando…' : '.nbt'}
          </button>
        </div>
      </header>

      <div className="studio-body">
        <nav className="rail" aria-label="Pasos">
          {STEPS.map((s, i) => (
            <button key={s.label} type="button" className={step === i ? 'on' : ''} onClick={() => setStep(i)}>
              <s.icon size={18} />
              <span className="n">{i + 1}</span>
              {s.label}
            </button>
          ))}
        </nav>

        <aside className="inspector">
          <div className="insp-head">
            <span className="eyebrow">Paso {step + 1} de {STEPS.length}</span>
            <h2>{STEPS[step].label}</h2>
          </div>
          {step === 0 && <MassingStep building={building} update={update} />}
          {step === 1 && <FloorsStep building={building} update={update} />}
          {step === 2 && <FacadeStep building={building} update={update} />}
          {step === 3 && <BaseRoofStep building={building} update={update} />}
          <div className="plan-buttons">
            {step > 0 && (
              <button type="button" className="ghost" onClick={() => setStep(step - 1)}>
                ← Anterior
              </button>
            )}
            {step < STEPS.length - 1 && (
              <button type="button" className="primary" onClick={() => setStep(step + 1)}>
                Siguiente →
              </button>
            )}
          </div>
          {!compiled.ok && <div className="alert err">{compiled.errors.slice(0, 3).join(' | ')}</div>}
          {error && <div className="alert err">{error}</div>}
          {notice && <div className="alert ok">{notice}</div>}
        </aside>

        <main className="viewport theme-dark">
          {viewer && viewer.states.length ? (
            <Suspense fallback={<div className="viewport-empty">Cargando visor 3D…</div>}>
              <MinecraftStructureViewer model={viewer} theme="dark" assetFile={viewerAssetFile} />
            </Suspense>
          ) : (
            <div className="viewport-empty">El diseño no produjo bloques visibles.</div>
          )}
          {compiled.ok && compiled.warnings.length > 0 && (
            <div className="toast warn">{compiled.warnings.slice(0, 2).join(' | ')}</div>
          )}
          {!!parts.length && (
            <div className="toast ok">
              {parts.map((p) => (
                <div key={p.index}>parte_{p.index}.nbt → offset [{p.offset.join(', ')}] · {p.size.join('×')}</div>
              ))}
            </div>
          )}
        </main>
      </div>

      <footer className="statusbar">
        <span>{summary || '—'}</span>
        {!!palette.length && <span>Paleta: {palette.join(', ')}</span>}
        {!!removed.length && <span className="warn">Omitidos: {removed.map((r) => `${r.name}×${r.count}`).join(', ')}</span>}
        {viewerAssetFile
          ? <span className="ok">Texturas: {viewerAssetFile.name}</span>
          : <span>Vista simplificada (sube client.jar para texturas)</span>}
      </footer>
    </div>
  )
}
