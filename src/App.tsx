import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Boxes, Download, ImagePlus, ScanEye, Sparkles } from 'lucide-react'
import { GEMINI_MODELS, imageToRecipe, localPromptToRecipe } from './ai/gemini'
import { validateRecipe, type Recipe } from './ai/schema'
import { countBlocks, interpretRecipe, type VoxelGrid } from './voxel/interpreter'
import { applyInteriorOps, buildInteriorOps, type InteriorOptions } from './voxel/interior'
import { gridToNbt, placementGuide, type NbtPart } from './voxel/nbt'
import { gridToViewer } from './voxel/viewer'
import type { ViewerModel } from './generator/viewerTypes'
import { RecipePanel } from './components/RecipePanel'
import { InteriorPanel } from './components/InteriorPanel'
import './App.css'

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

  const [recipeText, setRecipeText] = useState('')
  const [grid, setGrid] = useState<VoxelGrid | null>(null)
  const [size, setSize] = useState<[number, number, number] | null>(null)
  const [parts, setParts] = useState<NbtPart[]>([])
  const [palette, setPalette] = useState<string[]>([])
  const [removed, setRemoved] = useState<{ name: string; count: number }[]>([])

  const [floorYsText, setFloorYsText] = useState('3, 6, 9, 12')
  const [interior, setInterior] = useState<InteriorOptions>({ floors: true, stairs: true, lighting: true, furnish: false, floorYs: [] })
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [applying, setApplying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const validation = useMemo(() => {
    if (!recipeText.trim()) return { ok: false as const, errors: [] as string[], warnings: [] as string[] }
    try {
      return validateRecipe(JSON.parse(recipeText))
    } catch {
      return { ok: false as const, errors: ['El JSON tiene errores de sintaxis.'], warnings: [] as string[] }
    }
  }, [recipeText])

  const viewer: ViewerModel | null = useMemo(
    () => (grid && size ? gridToViewer(grid, size) : null),
    [grid, size],
  )

  const summary = useMemo(() => {
    if (!recipeText.trim()) return ''
    try {
      const r = JSON.parse(recipeText) as Recipe
      const n = grid ? countBlocks(grid) : 0
      return `${r.size?.join('×')} · ${r.shell_ops?.length ?? 0} ops cáscara · ${r.interior_ops?.length ?? 0} ops interior · ${n} bloques en visor`
    } catch {
      return ''
    }
  }, [recipeText, grid])

  const pickImage = (f: File | undefined) => {
    if (!f) return
    setImage(f)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }

  const generateRecipe = async () => {
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
        const { recipe, warnings } = await imageToRecipe({ apiKey: geminiKey, model: geminiModel, image })
        setRecipeText(JSON.stringify(recipe, null, 2))
        if (warnings.length) setNotice(warnings.join(' | '))
        buildBase(recipe)
      } else {
        const { recipe, warnings } = await localPromptToRecipe({ endpoint, description: localDesc })
        setRecipeText(JSON.stringify(recipe, null, 2))
        if (warnings.length) setNotice(warnings.join(' | '))
        buildBase(recipe)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falló la generación.')
    } finally {
      setLoading(false)
    }
  }

  const buildBase = (recipe?: Recipe) => {
    setBuilding(true)
    setError('')
    try {
      const parsed = recipe ?? (JSON.parse(recipeText) as Recipe)
      const v = validateRecipe(parsed)
      if (!v.ok) throw new Error(v.errors.join(' | '))
      const { grid: g, size: s, errors } = interpretRecipe(parsed)
      if (errors.length) setNotice(errors.join(' | '))
      setGrid(g)
      setSize(s)
      setParts([])
      // Sugerir niveles de piso desde facade.floors si existen
      if (parsed.facade?.floors && parsed.facade.floors > 1 && s[1] > 6) {
        const step = Math.max(3, Math.floor((s[1] - 4) / parsed.facade.floors))
        const ys: number[] = []
        for (let y = 3; y < s[1] - 1; y += step) ys.push(y)
        setFloorYsText(ys.join(', '))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Receta inválida.')
    } finally {
      setBuilding(false)
    }
  }

  const parseFloorYs = (maxY: number) => {
    const ys = floorYsText.split(',').map((t) => Number(t.trim())).filter((n) => Number.isInteger(n) && n > 0 && n < maxY)
    return [...new Set(ys)].sort((a, b) => a - b)
  }

  const applyInterior = () => {
    if (!recipeText.trim() || !size) return
    setApplying(true)
    setError('')
    try {
      const parsed = JSON.parse(recipeText) as Recipe
      const base = interpretRecipe(parsed)
      const ys = parseFloorYs(size[1])
      const ops = buildInteriorOps(size, { ...interior, floorYs: ys })
      const errs = applyInteriorOps(base.grid, size, [...parsed.interior_ops, ...ops])
      if (errs.length) setNotice(errs.join(' | '))
      setGrid(base.grid)
      setParts([])
      setNotice(`Interior aplicado (${ops.length} ops) sobre la base. La fachada no cambió.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el interior.')
    } finally {
      setApplying(false)
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
            <small>Imagen o prompt → receta visible → NBT · repo de pruebas</small>
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
              <p>{tab === 'image' ? 'La IA estima receta compacta; la geometría la construye el código.' : 'Qwen local genera la receta desde texto.'}</p>
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
          <button className="primary" type="button" disabled={loading} onClick={generateRecipe}>
            {loading ? 'Generando receta…' : '1 · Generar receta y construir base'}
          </button>
          {error && <div className="alert err">{error}</div>}
          {notice && <div className="alert ok">{notice}</div>}
        </section>

        <RecipePanel
          recipeText={recipeText}
          setRecipeText={setRecipeText}
          errors={validation.errors}
          warnings={validation.warnings}
          summary={summary}
          building={building}
          canBuild={!!recipeText.trim() && validation.ok}
          onBuild={() => buildBase()}
        />

        <section className="card">
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
            <div className="empty">Genera la receta para ver la base aquí.</div>
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

        <InteriorPanel
          opts={interior}
          setOpts={setInterior}
          floorYsText={floorYsText}
          setFloorYsText={setFloorYsText}
          disabled={!grid}
          applying={applying}
          onApply={applyInterior}
        />
      </main>
    </div>
  )
}
