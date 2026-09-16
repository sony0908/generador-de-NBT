import type { PlanSet } from '../ai/plans'
import { normalizeBlockName } from './palette'
import { emptyGrid, type VoxelGrid } from './interpreter'
import type { Vec3 } from '../ai/schema'

export type FuseResult = {
  grid: VoxelGrid
  size: Vec3
  kept: number
  carved: number
  conflicts: string[]
}

// Fusión sin IA: intersección de extrusiones (visual hull).
// Un voxel sobrevive solo si ningún plano dice "air" en su proyección.
// Interior hueco: solo se conserva la cáscara exterior.

function resolveCell(cell: unknown, palette: Record<string, string>): string | null {
  if (typeof cell !== 'string') return null
  const t = cell.trim()
  if (!t || t.toLowerCase() === 'air' || t.toLowerCase() === 'minecraft:air') return null
  if (Object.hasOwn(palette, t)) {
    const mapped = normalizeBlockName(palette[t])
    if (mapped) return mapped
  }
  return normalizeBlockName(t)
}

export function fusePlanSet(ps: PlanSet): FuseResult {
  const [sx, sy, sz] = ps.size
  const grid = emptyGrid(ps.size)
  const conflicts: string[] = []
  let kept = 0
  let carved = 0

  const cellAt = (plan: 'front' | 'side' | 'top', a: number, b: number): string | null => {
    const g = ps.plans[plan]
    const row = g.grid[b]
    if (!row) return null
    return resolveCell(row[a], ps.palette)
  }

  for (let y = 0; y < sy; y++) {
    const row = sy - 1 - y // fila 0 = parte alta
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const front = cellAt('front', x, row)
        const side = cellAt('side', z, row)
        const top = cellAt('top', x, z)
        // Talla: si algún plano dice aire, el voxel no existe.
        if (!front || !side || !top) {
          carved += 1
          continue
        }
        const onX = x === 0 || x === sx - 1
        const onZ = z === 0 || z === sz - 1
        const onTop = y === sy - 1
        if (!onX && !onZ && !onTop) continue // interior hueco

        // Material según la cara dueña. Techo manda en su capa, frontal en caras Z, lateral en caras X.
        let block: string = front
        const owners: string[] = []
        if (onTop) owners.push(`cenital:${top}`)
        if (onZ) owners.push(`frontal:${front}`)
        if (onX) owners.push(`lateral:${side}`)
        if (onTop) block = top
        else if (onZ) block = front
        else block = side

        const distinct = new Set(owners.map((o) => o.split(':')[1]))
        if (distinct.size > 1 && conflicts.length < 12) {
          conflicts.push(`[${x},${y},${z}] discrepan ${owners.join(' vs ')} → gana ${block}.`)
        }
        grid[y][z][x] = block
        kept += 1
      }
    }
  }
  if (conflicts.length === 12) conflicts.push('…más conflictos omitidos.')
  return { grid, size: ps.size, kept, carved, conflicts }
}

/** Escalado determinista (vecino más cercano) sobre las 3 grillas. La IA nunca escala. */
export function scalePlanSet(ps: PlanSet, factor: number): PlanSet {
  if (factor >= 1) return { ...ps, scale: 1 }
  const [sx, sy, sz] = ps.size
  const nx = Math.max(1, Math.round(sx * factor))
  const ny = Math.max(1, Math.round(sy * factor))
  const nz = Math.max(1, Math.round(sz * factor))

  const resample = (w: number, h: number, nw: number, nh: number, grid: string[][]) => {
    const out: string[][] = []
    for (let y = 0; y < nh; y++) {
      const row: string[] = []
      const srcY = Math.min(h - 1, Math.floor((y * h) / nh))
      for (let x = 0; x < nw; x++) {
        const srcX = Math.min(w - 1, Math.floor((x * w) / nw))
        row.push(grid[srcY]?.[srcX] ?? 'air')
      }
      out.push(row)
    }
    return out
  }

  return {
    ...ps,
    size: [nx, ny, nz],
    scale: factor,
    estimated_real_size: ps.estimated_real_size ?? ps.size,
    plans: {
      front: { w: nx, h: ny, grid: resample(sx, sy, nx, ny, ps.plans.front.grid) },
      side: { w: nz, h: ny, grid: resample(sz, sy, nz, ny, ps.plans.side.grid) },
      top: { w: nx, h: nz, grid: resample(sx, sz, nx, nz, ps.plans.top.grid) },
    },
  }
}

export const SCALE_OPTIONS = [1, 0.75, 0.5] as const
