// Receta universal v2: sirve para torres, casas, barcos, estatuas, etc.
// La IA devuelve la receta (visible/editable). El código la ejecuta.

export type Vec3 = [number, number, number]

export type Face = 'front' | 'back' | 'left' | 'right' | 'all'

export type ShellOp =
  | { op: 'box'; from: Vec3; to: Vec3; block: string; hollow?: boolean }
  | { op: 'floor_slab'; y: number; block: string; from?: [number, number]; to?: [number, number]; props?: Record<string, string> }
  | {
      op: 'grid_windows'
      face: Face | Face[]
      y0: number
      y1: number
      w: number
      gap: number
      block: string
      /** Región opcional (para fachadas por volumen). Sin ella se usa toda la cara. */
      x0?: number
      x1?: number
      z0?: number
      z1?: number
    }
  | {
      op: 'custom_windows'
      face: Face | Face[]
      /** Región del volumen (fachada). */
      x0?: number
      x1?: number
      z0?: number
      z1?: number
      /** Primera fila del fuste, nº de pisos y alto por piso. */
      shaftY0: number
      floors: number
      floorH: number
      /** Separación horizontal entre ventanas (del template). */
      gap: number
      /** Filas de muro sobre la losa antes de la ventana. */
      sill: number
      /**
       * Pixel-art por ventana (filas de arriba hacia abajo).
       * 'G' vidrio, 'W' muro, '.' no tocar. Ancho = nº de columnas.
       */
      pattern: string[][]
      wall: string
      glass: string
    }
  | { op: 'column'; x: number; z: number; y0: number; y1: number; block: string }
  | { op: 'stairs_run'; from: Vec3; direction: '+x' | '-x' | '+z' | '-z'; steps: number; block: string }
  | { op: 'roof_gable'; y: number; block: string; from?: [number, number]; to?: [number, number]; axis?: 'x' | 'z' }
  | { op: 'fill_sphere'; center: Vec3; radius: number; block: string; hollow?: boolean }
  | { op: 'mirror'; axis: 'x' | 'z' }
  | { op: 'replace'; from: Vec3; to: Vec3; find: string; block: string }

export type InteriorOp =
  | { op: 'add_floors'; floorYs: number[]; block: string }
  | { op: 'staircase'; x: number; z: number; y0: number; y1: number; direction: '+x' | '-x' | '+z' | '-z'; block: string }
  | { op: 'lighting'; floorYs: number[]; block: string; spacing: number }
  | { op: 'furnish'; floorYs: number[]; style: 'basic' | 'apartment' }

export type Recipe = {
  size: Vec3
  palette: Record<string, string>
  symmetry: { back: 'mirror_front' | 'custom'; sides?: 'mirror_x' | 'custom' }
  facade?: { floors?: number; bays?: number; window?: [number, number]; gap?: number; style?: string }
  shell_ops: ShellOp[]
  interior_ops: InteriorOp[]
  notes?: string
}

export type RecipeValidation = { ok: boolean; errors: string[]; warnings: string[] }

const isInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n)

function checkVec3(v: unknown, name: string, errors: string[]) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isInt)) {
    errors.push(`"${name}" debe ser [x, y, z] con enteros.`)
    return false
  }
  return true
}

export function validateRecipe(r: unknown): RecipeValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!r || typeof r !== 'object') return { ok: false, errors: ['La receta no es un objeto JSON.'], warnings }
  const recipe = r as Partial<Recipe>

  if (!checkVec3(recipe.size, 'size', errors)) return { ok: false, errors, warnings }
  const [sx, sy, sz] = recipe.size as Vec3
  if (sx < 1 || sy < 1 || sz < 1) errors.push('"size" debe ser mayor a 0 en cada eje.')
  // Sin topes de diseño: se permiten construcciones gigantes. Solo se avisa
  // del límite real del bloque de estructuras (48 por eje → multi-NBT).
  if (sx > 48 || sy > 48 || sz > 48) {
    warnings.push(`Tamaño ${sx}x${sy}x${sz}: supera 48 en un eje → se exportará en partes (multi-NBT) con guía de colocación.`)
  }
  if (!recipe.palette || typeof recipe.palette !== 'object') errors.push('"palette" debe ser un objeto {alias: "minecraft:id"}.')
  if (!Array.isArray(recipe.shell_ops)) errors.push('"shell_ops" debe ser un arreglo de operaciones.')
  if (recipe.interior_ops !== undefined && !Array.isArray(recipe.interior_ops)) errors.push('"interior_ops" debe ser un arreglo.')

  // Chequeo de coordenadas dentro de size
  const inside = (v: Vec3) => v[0] >= 0 && v[1] >= 0 && v[2] >= 0 && v[0] < sx && v[1] < sy && v[2] < sz
  if (Array.isArray(recipe.shell_ops)) {
    recipe.shell_ops.forEach((op, i) => {
      if (!op || typeof op !== 'object' || typeof (op as { op: string }).op !== 'string') {
        errors.push(`shell_ops[${i}]: operación inválida.`)
        return
      }
      const o = op as ShellOp
      if ((o.op === 'box' || o.op === 'replace') && (!inside(o.from) || !inside(o.to))) {
        errors.push(`shell_ops[${i}] (${o.op}): from/to fuera de size [${sx},${sy},${sz}].`)
      }
      if (o.op === 'grid_windows' && (o.y0 < 0 || o.y1 >= sy || o.y0 > o.y1)) {
        errors.push(`shell_ops[${i}] (grid_windows): rango y0..y1 fuera de la altura.`)
      }
      if (o.op === 'fill_sphere' && (o.radius < 1 || o.radius > 64)) {
        errors.push(`shell_ops[${i}] (fill_sphere): radio 1..64.`)
      }
    })
  }
  return { ok: errors.length === 0, errors, warnings }
}
