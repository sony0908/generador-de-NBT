import { buildUniversalPrompt, buildLocalPromptText } from './prompt'
import { validateRecipe, type Recipe } from './schema'

export const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
] as const

export function extractJson(raw: string): unknown {
  let cleaned = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) cleaned = cleaned.slice(first, last + 1)
  return JSON.parse(cleaned)
}

export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve({ base64: result.split(',')[1], mimeType: file.type || 'image/jpeg' })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export type RecipeResult = { recipe: Recipe; warnings: string[]; rawText: string }

function ensureRecipe(parsed: unknown): RecipeResult {
  const v = validateRecipe(parsed)
  if (!v.ok) throw new Error('Receta inválida: ' + v.errors.join(' | '))
  return { recipe: parsed as Recipe, warnings: v.warnings, rawText: JSON.stringify(parsed, null, 2) }
}

export async function imageToRecipe(opts: { apiKey: string; model: string; image: File; footprint?: number }): Promise<RecipeResult> {
  const { base64, mimeType } = await fileToBase64(opts.image)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${opts.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: buildUniversalPrompt() }, { inlineData: { mimeType, data: base64 } }] },
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
  return ensureRecipe(extractJson(text))
}

export async function localPromptToRecipe(opts: { endpoint: string; description: string }): Promise<RecipeResult> {
  const res = await fetch(`${opts.endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen',
      messages: [
        { role: 'system', content: 'Generador de recetas de construcción Minecraft v2. Responde solo JSON válido.' },
        { role: 'user', content: buildLocalPromptText(opts.description) },
      ],
      temperature: 0.1,
    }),
  })
  if (!res.ok) throw new Error(`IA local HTTP ${res.status}`)
  const data = await res.json()
  const reply = data?.choices?.[0]?.message?.content as string | undefined
  if (!reply) throw new Error('La IA local no respondió.')
  return ensureRecipe(extractJson(reply))
}
