import type { InteriorOp, Vec3 } from '../ai/schema'
import type { VoxelGrid } from './interpreter'

export type InteriorOptions = {
  floors: boolean
  stairs: boolean
  lighting: boolean
  furnish: boolean
  floorYs: number[]
  slab?: string
  stairBlock?: string
  lightBlock?: string
}

// Genera interior_ops deterministas a partir de toggles (Fase 2, sin IA).
export function buildInteriorOps(size: Vec3, opts: InteriorOptions): InteriorOp[] {
  const ops: InteriorOp[] = []
  const slab = opts.slab ?? 'minecraft:oak_planks'
  if (opts.floors && opts.floorYs.length) ops.push({ op: 'add_floors', floorYs: opts.floorYs, block: slab })
  if (opts.stairs && opts.floorYs.length >= 1) {
    const [sx, , sz] = size
    const x = Math.min(sx - 2, Math.max(1, 1))
    const z = Math.min(sz - 2, Math.max(1, 1))
    let y0 = 1
    for (const fy of opts.floorYs) {
      if (fy - y0 >= 2) {
        ops.push({ op: 'staircase', x, z, y0, y1: fy - 1, direction: '+x', block: opts.stairBlock ?? 'minecraft:oak_stairs' })
      }
      y0 = fy + 1
    }
  }
  if (opts.lighting && opts.floorYs.length) {
    ops.push({ op: 'lighting', floorYs: opts.floorYs, block: opts.lightBlock ?? 'minecraft:sea_lantern', spacing: 4 })
  }
  if (opts.furnish && opts.floorYs.length) {
    ops.push({ op: 'furnish', floorYs: opts.floorYs, style: 'basic' })
  }
  return ops
}

export function applyInteriorOps(grid: VoxelGrid, size: Vec3, ops: InteriorOp[]): string[] {
  const errors: string[] = []
  const [sx, sy, sz] = size
  const set = (x: number, y: number, z: number, b: string) => {
    if (x > 0 && z > 0 && x < sx - 1 && z < sz - 1 && y >= 0 && y < sy) grid[y][z][x] = b
  }
  for (const op of ops) {
    if (op.op === 'add_floors') {
      for (const y of op.floorYs) {
        if (y < 0 || y >= sy) {
          errors.push(`add_floors: y=${y} fuera de altura.`)
          continue
        }
        for (let z = 1; z < sz - 1; z++) for (let x = 1; x < sx - 1; x++) set(x, y, z, op.block)
      }
    } else if (op.op === 'staircase') {
      for (let y = op.y0; y <= op.y1; y++) {
        const s = y - op.y0
        const x = op.direction === '+x' ? op.x + s : op.direction === '-x' ? op.x - s : op.x
        const z = op.direction === '+z' ? op.z + s : op.direction === '-z' ? op.z - s : op.z
        set(x, y, z, op.block)
      }
    } else if (op.op === 'lighting') {
      for (const y of op.floorYs) {
        for (let z = 2; z < sz - 1; z += op.spacing) {
          for (let x = 2; x < sx - 1; x += op.spacing) set(x, y + 2 < sy ? y + 2 : y, z, op.block)
        }
      }
    } else if (op.op === 'furnish') {
      for (const y of op.floorYs) {
        if (y + 1 >= sy) continue
        // Mesa + sillas mínimas al centro de cada piso
        const cx = Math.floor(sx / 2)
        const cz = Math.floor(sz / 2)
        set(cx, y + 1, cz, 'minecraft:crafting_table')
        set(cx - 1, y + 1, cz, 'minecraft:oak_stairs')
        set(cx + 1, y + 1, cz, 'minecraft:oak_stairs')
        set(cx, y + 1, cz - 2, 'minecraft:white_bed')
      }
    }
  }
  return errors
}
