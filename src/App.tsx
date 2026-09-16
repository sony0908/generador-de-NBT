import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Boxes, Download, DraftingCompass, ImagePlus, ScanEye, Sparkles } from 'lucide-react'
import {
  GEMINI_MODELS,
  PLAN_LABELS,
  PLAN_NAMES,
  diffGrids,
  imageToPlans,
  localPromptToPlans,
  regeneratePlan,
  validatePlanSet,
  type PlanName,
  type PlanSet,
} from './ai/plans'
import { fusePlanSet, scalePlanSet, SCALE_OPTIONS } from './voxel/fuse'
import type { VoxelGrid } from './voxel/interpreter'
import { gridToNbt, placementGuide, type NbtPart } from './voxel/nbt'
import { gridToViewer } from './voxel/viewer'
import type { ViewerModel } from './generator/viewerTypes'
import { PlanCard } from './components/PlanCard'
import './App.css'

const SHOW_INTERIOR = false // Fase 2 (pisos/escaleras/luz/muebles) pospuesta por decisión del usuario.

const MinecraftStructureViewer = lazy(async () => {
  const module = await import('./components/MinecraftStructureViewer')
  return { default: module.MinecraftStructureViewer }
})

export default function App() {
  const [tab, setTab] = useState<'image' | 'local'>('image')
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gennbt-gemini-key') || '')
  const [geminiModel, setGeminiModel] = useState(() => localStorage.getItem('gennbt-gemini-model') || GEMINI_MODELS[0])
  const [endpoint, setEndpoint] = useState('http://localhost:5001/v1')
  const [localDesc, setLocalDesc] = useState('Una torre moderna blanca de 10 pisos con base comercial y corona abierta')
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [viewerAssetFile, setViewerAssetFile] = useState<File | null>(null)
  const viewerAssetInputRef = useRef<HTMLInputElement>(null)

  // Planos arquitectónicos (escala 1, tal como los dibujó la IA)
  const [basePlans, setBasePlans] = useState<PlanSet | null>(null)
  const [status, setStatus] = useState<Record<PlanName, boolean>>({ front: false, side: false, top: false })
  const [attempts, setAttempts] = useState<Record<PlanName, number>>({ front: 1, side: 1, top: 1 })
  const [scaleFactor, setScaleFactor] = useState<number>(1)

  const [grid, setGrid] = useState<VoxelGrid | null>(null)
  const [size, setSize] = useState<[number, number, number] | null>(null)
  const [fuseInfo, setFuseInfo] = useState('')
  const [parts, setParts] = useState<NbtPart[]>([])
  const [palette, setPalette] = useState<string[]>([])
  const [removed, setRemoved] = useState<{ name: string; count: number }[]>([])

  const [loading, setLoading] = useState(false)
  const [regenBusy, setRegenBusy] = useState<PlanName | null>(null)
  const [building, setBuilding] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Planos efectivos = base × escala determinista (la IA nunca escala).
  const effective = useMemo(
    () => (basePlans ? scalePlanSet(basePlans, scaleFactor) : null),
    [basePlans, scaleFactor],
  )
  const effectiveValidation = useMemo(
    () => (effective ? validatePlanSet(effective) : null),
    [effective],
  )
  const allAccepted = PLAN_NAMES.every((p) => status[p])
  const needsScale = !!basePlans && (basePlans.size[0] > 48 || basePlans.size[1] > 48 || basePlans.size[2] > 48)

  const viewer: ViewerModel | null = useMemo(
    () => (grid && size ? gridToViewer(grid, size) : null),
    [grid, size],
  )

  const pickImage = (f: File | undefined) => {
    if (!f) return
    setImage(f)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }

  const resetPlans = (ps: PlanSet) => {
    setBasePlans(ps)
    setStatus({ front: false, side: false, top: false })
    setAttempts({ front: 1, side: 1, top: 1 })
    setScaleFactor(1)
    setGrid(null)
    setSize(null)
    setParts([])
    setFuseInfo('')
  }

  const generatePlans = async () => {
    setLoading(true)
    setError('')
    setNotice('')
    setParts([])
    try {
      if (tab === 'image') {
        if (!image) throw new Error('Sube primero la imagen de referencia.')
        if (!geminiKey) throw new Error('Ingresa tu API Key de Gemini.')
        localStorage.setItem('gennbt-gemini-key', geminiKey)
        localStorage.setItem('gennbt-gemini-model', geminiModel)
        const { planSet, warnings } = await imageToPlans({ apiKey: geminiKey, model: geminiModel, image })
        resetPlans(planSet)
        setNotice(
          `Despiece listo: ${planSet.size.join('×')}. Revisa los 3 planos y acéptalos.` +
            (warnings.length ? ' ' + warnings.join(' | ') : ''),
        )
      } else {
        const { planSet, warnings } = await localPromptToPlans({ endpoint, description: localDesc })
        resetPlans(planSet)
        if (warnings.length) setNotice(warnings.join(' | '))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falló la generación.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async (plan: PlanName, note: string) => {
    if (!basePlans) return
    setRegenBusy(plan)
    setError('')
    try {
      const { planSet } = await regeneratePlan({
        apiKey: geminiKey,
        model: geminiModel,
        image: tab === 'image' ? image : null,
        current: basePlans,
        plan,
        userNote: note,
      })
      const changed = diffGrids(basePlans.plans[plan], planSet.plans[plan])
      setBasePlans(planSet)
      setStatus((s) => ({ ...s, [plan]: false }))
      setAttempts((a) => ({ ...a, [plan]: a[plan] + 1 }))
      setGrid(null)
      setParts([])
      setNotice(
        changed >= 0
          ? `Plano ${PLAN_LABELS[plan]} regenerado: ${changed} celdas distintas. Revísalo y acéptalo.`
          : `Plano ${PLAN_LABELS[plan]} regenerado con otras dimensiones. Revísalo y acéptalo.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo regenerar.')
    } finally {
      setRegenBusy(null)
    }
  }

  const handleSaveEdit = (plan: PlanName, gridCells: string[][]) => {
    if (!basePlans) return
    const next: PlanSet = {
      ...basePlans,
      plans: { ...basePlans.plans, [plan]: { ...basePlans.plans[plan], grid: gridCells } },
    }
    const v = validatePlanSet(next)
    if (!v.ok) {
      setError('Edición inválida: ' + v.errors.slice(0, 3).join(' | '))
      return
    }
    setBasePlans(next)
    setStatus((s) => ({ ...s, [plan]: false }))
    setGrid(null)
    setParts([])
    setNotice(`Plano ${PLAN_LABELS[plan]} editado a mano. Revísalo y acéptalo.`)
  }

  const build3D = () => {
    if (!effective || !effectiveValidation?.ok) return
    setBuilding(true)
    setError('')
    try {
      const { grid: g, size: s, kept, carved, conflicts } = fusePlanSet(effective)
      if (!kept) throw new Error('La fusión no produjo bloques (¿planos llenos de air?).')
      setGrid(g)
      setSize(s)
      setParts([])
      setFuseInfo(
        `${kept} bloques conservados · ${carved} tallados · trasera espejada del frontal` +
          (conflicts.length ? ` · ${conflicts.length} conflictos resueltos` : ''),
      )
      if (conflicts.length) setNotice(conflicts.slice(0, 5).join(' | '))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo fusionar.')
    } finally {
      setBuilding(false)
    }
  }

  const exportNbt = async () => {
    if (!grid || !size) return
    setExporting(true)
    setError('')
    try {
      const result = await gridToNbt(grid, size)
      setParts(result.parts)
      setPalette(result.palette)
      setRemoved(result.removed)
      result.parts.forEach((p) => {
        const blob = new Blob([p.bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.parts.length > 1 ? `estructura_parte_${p.index}.nbt` : 'estructura.nbt'
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
            <strong>Generador de NBT</strong>
            <small>Foto → 3 planos → fusión 3D → NBT</small>
          </div>
        </div>
        <div className="tabs">
          <button type="button" className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')}>
            <ImagePlus size={15} /> Imagen (Gemini)
          </button>
          <button type="button" className={tab === 'local' ? 'active' : ''} onClick={() => setTab('local')}>
            <Sparkles size={15} /> Texto (KoboldCpp)
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="card">
          <div className="card-head">
            <span className="icon"><ScanEye size={20} /></span>
            <div>
              <span className="eyebrow">Paso 1 — Entrada</span>
              <h2>{tab === 'image' ? 'Foto de referencia' : 'Descripción local'}</h2>
              <p>La IA dibuja 3 planos ortográficos; la geometría 3D la construye el código.</p>
            </div>
          </div>
          {tab === 'image' ? (
            <>
              <label className="field">
                <span>API Key de Gemini (solo localStorage)</span>
                <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIzaSy…" />
              </label>
              <label className="field">
                <span>Modelo gratuito</span>
                <select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
                  {GEMINI_MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <div className="drop">
                {preview ? (
                  <div className="preview-wrap">
                    <img src={preview} alt="Referencia" />
                    <button type="button" className="ghost" onClick={() => { setImage(null); setPreview(null) }}>Cambiar imagen</button>
                  </div>
                ) : (
                  <label className="drop-label">
                    Sube la foto (Pinterest, captura…)
                    <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
                  </label>
                )}
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <span>Endpoint KoboldCpp</span>
                <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
              </label>
              <label className="field">
                <span>Descripción</span>
                <textarea rows={3} value={localDesc} onChange={(e) => setLocalDesc(e.target.value)} />
              </label>
            </>
          )}
          <button className="primary" type="button" disabled={loading} onClick={generatePlans}>
            {loading ? 'Dibujando planos…' : '1 · Generar los 3 planos'}
          </button>
          {error && <div className="alert err">{error}</div>}
          {notice && <div className="alert ok">{notice}</div>}
        </section>

        <section className="card span">
          <div className="card-head">
            <span className="icon"><DraftingCompass size={20} /></span>
            <div>
              <span className="eyebrow">Paso 2 — Planos (1 celda = 1 bloque)</span>
              <h2>Revisa, regenera o edita · acepta los 3 para construir</h2>
              <p>Trasera = espejo del frontal. La IA nunca escala: si hace falta, el escalado lo aplicas tú aquí.</p>
            </div>
          </div>
          {!effective ? (
            <div className="empty">Genera los planos para verlos aquí.</div>
          ) : (
            <>
              <div className="scale-row">
                <span>
                  Tamaño {effective.size.join('×')}
                  {needsScale && scaleFactor === 1 ? ' · supera 48: elige escala o exporta multi-NBT' : ''}
                  {scaleFactor < 1 ? ` · escalado desde ${basePlans!.size.join('×')}` : ''}
                </span>
                <div className="seg">
                  {SCALE_OPTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={scaleFactor === f ? 'on' : ''}
                      onClick={() => { setScaleFactor(f); setGrid(null); setParts([]) }}
                    >
                      {f === 1 ? '1:1' : `${Math.round(f * 100)}%`}
                    </button>
                  ))}
                </div>
              </div>
              {effectiveValidation && !effectiveValidation.ok && (
                <div className="alert err">{effectiveValidation.errors.slice(0, 3).join(' | ')}</div>
              )}
              <div className="plans-grid">
                {PLAN_NAMES.map((p) => (
                  <PlanCard
                    key={p + scaleFactor}
                    name={p}
                    planSet={effective}
                    accepted={status[p]}
                    attempts={attempts[p]}
                    busy={regenBusy === p}
                    onAccept={() => setStatus((s) => ({ ...s, [p]: !s[p] }))}
                    onRegenerate={(note) => handleRegenerate(p, note)}
                    onSaveEdit={(g) => handleSaveEdit(p, g)}
                  />
                ))}
              </div>
              <button
                className="primary"
                type="button"
                disabled={!allAccepted || !effectiveValidation?.ok || building}
                onClick={build3D}
              >
                {building ? 'Fusionando…' : allAccepted ? '2 · Construir 3D desde los planos' : `Acepta los 3 planos (${PLAN_NAMES.filter((p) => status[p]).length}/3)`}
              </button>
              {fuseInfo && <div className="alert ok">{fuseInfo}</div>}
            </>
          )}
        </section>

        <section className="card span">
          <div className="card-head">
            <span className="icon"><Boxes size={20} /></span>
            <div>
              <span className="eyebrow">Paso 3 — Visor + exportar</span>
              <h2>Previsualiza y descarga</h2>
              <p>Si un eje supera 48 se exporta en partes con guía de colocación.</p>
            </div>
          </div>
          {viewer && viewer.states.length ? (
            <Suspense fallback={<div className="empty">Cargando visor 3D…</div>}>
              <MinecraftStructureViewer model={viewer} theme="dark" assetFile={viewerAssetFile} />
            </Suspense>
          ) : (
            <div className="empty">Acepta los 3 planos y construye para ver el 3D aquí.</div>
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
          <button className="primary" type="button" disabled={!grid || exporting} onClick={exportNbt}>
            <Download size={16} /> {exporting ? 'Exportando…' : '3 · Descargar .nbt'}
          </button>
        </section>
      </main>
    </div>
  )
}

// Referencia para no perder el módulo pospuesto (tree-shaking lo ignora con el flag).
void SHOW_INTERIOR
