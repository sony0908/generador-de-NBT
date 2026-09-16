import { normalizeBlockName } from '../voxel/palette'
import { extractJson, fileToBase64, GEMINI_MODELS } from './gemini'

export { GEMINI_MODELS }
export type { Recipe } from './schema'

// Planos arquitectónicos v1: 3 vistas ortográficas como grillas exactas.
// 1 celda = 1 bloque. Filas de ARRIBA hacia abajo (fila 0 = parte alta).
// front: X×Y (ancho × alto) · side: Z×Y (fondo × alto) · top: X×Z (ancho × fondo).

export type PlanName = 'front' | 'side' | 'top'

export const PLAN_NAMES: PlanName[] = ['front', 'side', 'top']

export const PLAN_LABELS: Record<PlanName, string> = {
  front: 'Frontal',
  side: 'Lateral',
  top: 'Cenital',
}

export type PlanGrid = {
  w: number
  h: number
  grid: string[][]
}

export type PlanSet = {
  size: [number, number, number]
  palette: Record<string, string>
  scale: number
  estimated_real_size?: [number, number, number]
  facade?: { floors?: number; bays?: number; style?: string }
  plans: Record<PlanName, PlanGrid>
}

export type PlanValidation = { ok: boolean; errors: string[]; warnings: string[] }

const isInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n)

export const MAX_PLAN_CELLS = 48

export function validatePlanSet(r: unknown): PlanValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!r || typeof r !== 'object') return { ok: false, errors: ['La respuesta no es un objeto JSON.'], warnings }
  const ps = r as Partial<PlanSet>

  if (!Array.isArray(ps.size) || ps.size.length !== 3 || !ps.size.every(isInt)) {
    return { ok: false, errors: ['"size" debe ser [X, Y, Z] con enteros.'], warnings }
  }
  const [sx, sy, sz] = ps.size
  if (sx < 1 || sy < 1 || sz < 1) errors.push('"size" debe ser mayor a 0 en cada eje.')
  if (sy > 384) errors.push(`Altura ${sy} excede el máximo de Minecraft (384).`)
  if (sx > MAX_PLAN_CELLS || sy > MAX_PLAN_CELLS || sz > MAX_PLAN_CELLS) {
    warnings.push(
      `Tamaño ${sx}×${sy}×${sz}: supera ${MAX_PLAN_CELLS} celdas por plano. Se ofrece escalado determinista o export multi-NBT.`,
    )
  }
  if (!ps.palette || typeof ps.palette !== 'object' || !Object.keys(ps.palette).length) {
    errors.push('"palette" debe ser un objeto no vacío {alias: "minecraft:id"}.')
  }
  if (!ps.plans || typeof ps.plans !== 'object') {
    errors.push('Faltan "plans" {front, side, top}.')
    return { ok: false, errors, warnings }
  }

  // Dimensiones esperadas por plano: front X×Y, side Z×Y, top X×Z.
  const expected: Record<PlanName, [number, number]> = {
    front: [sx, sy],
    side: [sz, sy],
    top: [sx, sz],
  }
  const unknownCells = new Set<string>()
  for (const name of PLAN_NAMES) {
    const plan = ps.plans[name]
    if (!plan || typeof plan !== 'object') {
      errors.push(`Falta el plano "${name}".`)
      continue
    }
    const [ew, eh] = expected[name]
    if (plan.w !== ew || plan.h !== eh) {
      errors.push(
        `Plano "${name}": declara ${plan.w}×${plan.h} pero "size" exige ${ew}×${eh}.`,
      )
      continue
    }
    if (!Array.isArray(plan.grid) || plan.grid.length !== eh) {
      errors.push(`Plano "${name}": debe tener ${eh} filas.`)
      continue
    }
    plan.grid.forEach((row, ri) => {
      if (!Array.isArray(row) || row.length !== ew) {
        errors.push(`Plano "${name}" fila ${ri}: debe tener ${ew} celdas.`)
        return
      }
      row.forEach((cell) => {
        if (typeof cell !== 'string') {
          errors.push(`Plano "${name}": hay celdas no textuales.`)
          return
        }
        const t = cell.trim().toLowerCase()
        if (t === 'air' || t === 'minecraft:air') return
        const inPalette = ps.palette ? Object.hasOwn(ps.palette, cell) || Object.hasOwn(ps.palette, t) : false
        if (!inPalette && !normalizeBlockName(cell)) unknownCells.add(String(cell))
      })
    })
  }
  if (unknownCells.size) {
    errors.push(`Celdas desconocidas (no están en palette ni son IDs válidos): ${[...unknownCells].slice(0, 5).join(', ')}${unknownCells.size > 5 ? '…' : ''}.`)
  }
  return { ok: errors.length === 0, errors, warnings }
}

export const PLANS_VERSION = 'plans-v1'

export function buildDespiecePrompt() {
  return `Eres un dibujante técnico de Minecraft. De esta foto extrae 3 planos ortográficos como grillas donde 1 celda = 1 bloque. Filas de ARRIBA hacia abajo (fila 0 = parte alta del edificio).

1. Cuenta ventanas/bloques en horizontal para estimar ancho (X) y fondo (Z), y en vertical para alto (Y). Declara "size": [X, Y, Z] PRIMERO.
2. "front": fachada visible, fiel al 100% (puerta, banda comercial, ritmo de ventanas, corona).
3. "side": lateral visible; lo que no se vea se infiere por simetría con lo visible.
4. "top": vista cenital (marco perimetral de la corona, huecos, remate de azotea).
5. La trasera NO se dibuja: el código espeja el frontal.
6. Si el edificio real supera 48 en algún eje, dibuja IGUAL a escala real y declara "estimated_real_size": [X, Y, Z]. NUNCA comprimas por tu cuenta: el código escala.
7. "scale": 1 siempre en tu respuesta.

Dimensiones obligatorias: front.w == size[0], front.h == size[1]; side.w == size[2], side.h == size[1]; top.w == size[0], top.h == size[2]. Cada fila mide exactamente w celdas.

Devuelve SOLO este JSON (sin markdown):
{
  "size": [11, 33, 11],
  "palette": {"muro": "minecraft:white_concrete", "vidrio": "minecraft:glass", "losa": "minecraft:stone_slab"},
  "scale": 1,
  "facade": {"floors": 10, "bays": 5, "style": "torre moderna blanca"},
  "plans": {
    "front": {"w": 11, "h": 33, "grid": [["muro","vidrio","muro", "..."], "..."]},
    "side": {"w": 11, "h": 33, "grid": []},
    "top": {"w": 11, "d": 11, "grid": []}
  }
}
OJO: top usa "w" y "h" (h = fondo Z), igual que los demás. Celdas: alias de "palette" o "air". IDs vanilla con namespace si no usas alias.`
}

export function buildRegenPrompt(plan: PlanName, userNote: string) {
  return `Repite SOLO el plano "${plan}" del mismo edificio y foto. Corrección del usuario: ${userNote || '(sin corrección: mejora la fidelidad con la foto)'}.
Mantén idénticos "size", "palette", "scale" y los otros dos planos (los repites tal cual los recibes). Solo JSON, sin markdown, mismo schema plans-v1.`
}

export type PlansResult = { planSet: PlanSet; warnings: string[] }

function ensurePlanSet(parsed: unknown): PlansResult {
  const v = validatePlanSet(parsed)
  if (!v.ok) throw new Error('Planos inválidos: ' + v.errors.slice(0, 4).join(' | '))
  return { planSet: parsed as PlanSet, warnings: v.warnings }
}

export async function imageToPlans(opts: { apiKey: string; model: string; image: File }): Promise<PlansResult> {
  const { base64, mimeType } = await fileToBase64(opts.image)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${opts.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: buildDespiecePrompt() }, { inlineData: { mimeType, data: base64 } }] },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error((err as { error?: { message?: string } })?.error?.message || `Gemini HTTP ${res.status}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined
  if (!text) throw new Error('Gemini no devolvió texto.')
  return ensurePlanSet(extractJson(text))
}

export async function regeneratePlan(opts: {
  apiKey: string
  model: string
  image: File | null
  current: PlanSet
  plan: PlanName
  userNote: string
}): Promise<PlansResult> {
  const parts: unknown[] = [{ text: buildRegenPrompt(opts.plan, opts.userNote) + '\nPlanSet actual:\n' + JSON.stringify(opts.current) }]
  if (opts.image) {
    const { base64, mimeType } = await fileToBase64(opts.image)
    parts.push({ inlineData: { mimeType, data: base64 } })
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${opts.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
      }),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error((err as { error?: { message?: string } })?.error?.message || `Gemini HTTP ${res.status}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined
  if (!text) throw new Error('Gemini no devolvió texto.')
  return ensurePlanSet(extractJson(text))
}

export async function localPromptToPlans(opts: { endpoint: string; description: string }): Promise<PlansResult> {
  const res = await fetch(`${opts.endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen',
      messages: [
        { role: 'system', content: 'Dibujante técnico de Minecraft. Respondes solo JSON válido plans-v1 (size, palette, scale:1, plans{front,side,top}). Sin foto: inventa proporciones coherentes.' },
        { role: 'user', content: opts.description + '\n\n' + buildDespiecePrompt().split('\n').slice(6).join('\n') },
      ],
      temperature: 0.2,
    }),
  })
  if (!res.ok) throw new Error(`IA local HTTP ${res.status}`)
  const data = await res.json()
  const reply = data?.choices?.[0]?.message?.content as string | undefined
  if (!reply) throw new Error('La IA local no respondió.')
  return ensurePlanSet(extractJson(reply))
}

/** Cuenta celdas distintas entre dos grillas (para informar qué cambió al regenerar). */
export function diffGrids(a: PlanGrid, b: PlanGrid) {
  if (a.w !== b.w || a.h !== b.h) return -1
  let n = 0
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      if ((a.grid[y]?.[x] ?? '') !== (b.grid[y]?.[x] ?? '')) n += 1
    }
  }
  return n
}
