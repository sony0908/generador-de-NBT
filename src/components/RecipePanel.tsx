import { AlertTriangle, CheckCircle2, FileJson, Hammer } from 'lucide-react'

type Props = {
  recipeText: string
  setRecipeText: (t: string) => void
  errors: string[]
  warnings: string[]
  summary: string
  building: boolean
  canBuild: boolean
  onBuild: () => void
}

export function RecipePanel({ recipeText, setRecipeText, errors, warnings, summary, building, canBuild, onBuild }: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <span className="icon"><FileJson size={20} /></span>
        <div>
          <span className="eyebrow">Paso 2 — Receta visible</span>
          <h2>Revisa y edita el programa</h2>
          <p>Si la IA se equivoca lo ves aquí antes de generar el NBT. Edita el JSON y pulsa Construir.</p>
        </div>
      </div>
      {summary && <div className="summary">{summary}</div>}
      <textarea
        className="recipe-text"
        value={recipeText}
        onChange={(e) => setRecipeText(e.target.value)}
        spellCheck={false}
        rows={16}
      />
      {warnings.map((w) => (
        <div className="alert warn" key={w}><AlertTriangle size={15} /> {w}</div>
      ))}
      {errors.map((e) => (
        <div className="alert err" key={e}><AlertTriangle size={15} /> {e}</div>
      ))}
      {!errors.length && canBuild && (
        <div className="alert ok"><CheckCircle2 size={15} /> Receta válida. Lista para construir.</div>
      )}
      <button className="primary" type="button" disabled={!canBuild || building} onClick={onBuild}>
        <Hammer size={16} /> {building ? 'Construyendo…' : 'Construir base en el visor'}
      </button>
    </section>
  )
}
