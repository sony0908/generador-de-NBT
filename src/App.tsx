import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Boxes, Download } from 'lucide-react'
import { validateRecipe } from './ai/schema'
import { interpretRecipe, countBlocks } from './voxel/interpreter'
import { gridToNbt, placementGuide, type NbtPart } from './voxel/nbt'
import { gridToViewer } from './voxel/viewer'
import type { ViewerModel } from './generator/viewerTypes'
import { compileBuilding } from './parametric/compiler'
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

const STEPS = ['Volumetría', 'Pisos', 'Fachada', 'Base y techo'] as const

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
      return { ok: true as const, grid, size, warnings: [...warnings, ...validation.warnings, ...errors] }
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
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Boxes size={26} />
          <div>
            <strong>Generador de edificios</strong>
            <small>Volumetría → pisos → fachada → base → NBT escalable</small>
          </div>
        </div>
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <button key={s} type="button" className={step === i ? 'on' : ''} onClick={() => setStep(i)}>
              {i + 1} · {s}
            </button>
          ))}
        </div>
      </header>

      <main className="layout">
        <section className="card span">
          <div className="card-head">
            <div>
              <span className="eyebrow">Paso {step + 1} de {STEPS.length}</span>
              <h2>{STEPS[step]}</h2>
            </div>
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
        </section>

        <section className="card span">
          <div className="card-head">
            <span className="icon"><Boxes size={20} /></span>
            <div>
              <span className="eyebrow">Vista en vivo + exportar</span>
              <h2>{summary || 'Diseño inválido'}</h2>
              <p>Todo cambio recompila al instante. Si un eje supera 48 se exporta en partes.</p>
            </div>
          </div>
          {!compiled.ok ? (
            <div className="alert err">{compiled.errors.slice(0, 3).join(' | ')}</div>
          ) : (
            <>
              {compiled.warnings.length > 0 && (
                <div className="alert warn">{compiled.warnings.slice(0, 4).join(' | ')}</div>
              )}
              {viewer && viewer.states.length ? (
                <Suspense fallback={<div className="empty">Cargando visor 3D…</div>}>
                  <MinecraftStructureViewer model={viewer} theme="dark" assetFile={viewerAssetFile} />
                </Suspense>
              ) : (
                <div className="empty">El diseño no produjo bloques visibles.</div>
              )}
            </>
          )}
          <div className="assets-row">
            <div className="assets-info">
              <span>Texturas: {viewerAssetFile ? viewerAssetFile.name : 'vista simplificada'}</span>
              <small>{viewerAssetFile ? 'Modelos y texturas reales del juego' : 'Sube tu client.jar para ver texturas reales'}</small>
            </div>
            <div className="assets-actions">
              <button type="button" className="ghost" onClick={() => viewerAssetInputRef.current?.click()}>
                {viewerAssetFile ? 'Cambiar client.jar' : 'Cargar client.jar'}
              </button>
              {viewerAssetFile && (
                <button type="button" className="ghost" onClick={() => setViewerAssetFile(null)}>
                  Quitar
                </button>
              )}
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
            </div>
          </div>
          {!!palette.length && (
            <div className="palette">Paleta: {palette.join(', ')}</div>
          )}
          {!!removed.length && (
            <div className="alert warn">Omitidos (no vanilla): {removed.map((r) => `${r.name}×${r.count}`).join(', ')}</div>
          )}
          {!!parts.length && (
            <div className="alert ok">
              {parts.map((p) => (
                <div key={p.index}>parte_{p.index}.nbt → offset [{p.offset.join(', ')}] · {p.size.join('×')} · {p.blocks} bloques</div>
              ))}
            </div>
          )}
          {error && <div className="alert err">{error}</div>}
          {notice && <div className="alert ok">{notice}</div>}
          <button className="primary" type="button" disabled={!compiled.ok || exporting} onClick={exportNbt}>
            <Download size={16} /> {exporting ? 'Exportando…' : 'Descargar .nbt'}
          </button>
        </section>
      </main>
    </div>
  )
}
