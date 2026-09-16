import type { Recipe, ShellOp, Vec3 } from '../ai/schema'
import { normalizeBlockName } from './palette'

export type VoxelGrid = (string | null)[][][] // [y][z][x]

export type InterpretResult = {
  grid: VoxelGrid
  size: Vec3
  errors: string[]
  appliedOps: number
}

function inBounds(x: number, y: number, z: number, size: Vec3) {
  return x >= 0 && y >= 0 && z >= 0 && x < size[0] && y < size[1] && z < size[2]
}

export function emptyGrid(size: Vec3): VoxelGrid {
  const [sx, sy, sz] = size
  const grid: VoxelGrid = []
  for (let y = 0; y < sy; y++) {
    const layer: (string | null)[][] = []
    for (let z = 0; z < sz; z++) layer.push(new Array<string | null>(sx).fill(null))
    grid.push(layer)
  }
  return grid
}

function resolveBlock(raw: string, palette: Record<string, string>, errors: string[], opIndex: number): string | null {
  const direct = normalizeBlockName(raw)
  if (!direct) return null
  // Si es alias de la paleta, úsalo; si no, el id directo.
  const aliased = palette[raw] ?? palette[direct] ?? direct
  const norm = normalizeBlockName(aliased)
  if (!norm) {
    errors.push(`op[${opIndex}]: bloque vacío.`)
    return null
  }
  return norm
}

function windowCols(len: number, w: number, gap: number) {
  const cols = new Set<number>()
  const period = w + gap
  const usable = len - 2
  if (usable <= 0 || period <= 0) return cols
  const fullWindows = Math.max(1, Math.floor((usable + gap) / period))
  const totalWin = fullWindows * w + (fullWindows - 1) * gap
  let start = 1 + Math.max(0, Math.floor((usable - totalWin) / 2))
  for (let k = 0; k < fullWindows; k++) {
    for (let i = 0; i < w; i++) {
      const c = start + k * period + i
      if (c >= 1 && c < len - 1) cols.add(c)
    }
  }
  return cols
}

function applyShellOp(grid: VoxelGrid, size: Vec3, palette: Record<string, string>, op: ShellOp, index: number, errors: string[]) {
  const [sx, sy, sz] = size
  const set = (x: number, y: number, z: number, b: string | null) => {
    if (inBounds(x, y, z, size)) grid[y][z][x] = b
  }
  switch (op.op) {
    case 'box': {
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block) return
      const [x0, y0, z0] = op.from
      const [x1, y1, z1] = op.to
      const xa = Math.min(x0, x1)
      const xb = Math.max(x0, x1)
      const ya = Math.min(y0, y1)
      const yb = Math.max(y0, y1)
      const za = Math.min(z0, z1)
      const zb = Math.max(z0, z1)
      for (let y = ya; y <= yb; y++) {
        for (let z = za; z <= zb; z++) {
          for (let x = xa; x <= xb; x++) {
            if (op.hollow) {
              const onShell = x === xa || x === xb || y === ya || y === yb || z === za || z === zb
              if (!onShell) continue
            }
            set(x, y, z, block)
          }
        }
      }
      return
    }
    case 'floor_slab': {
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block) return
      if (op.y < 0 || op.y >= sy) {
        errors.push(`op[${index}] floor_slab: y=${op.y} fuera de altura.`)
        return
      }
      const [fx0, fz0] = op.from ?? [0, 0]
      const [fx1, fz1] = op.to ?? [sx - 1, sz - 1]
      for (let z = Math.max(0, fz0); z <= Math.min(sz - 1, fz1); z++) {
        for (let x = Math.max(0, fx0); x <= Math.min(sx - 1, fx1); x++) set(x, op.y, z, block)
      }
      return
    }
    case 'grid_windows': {
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block) return
      const wx = windowCols(sx, op.w, op.gap)
      const wz = windowCols(sz, op.w, op.gap)
      const faces = op.face === 'all' ? (['front', 'back', 'left', 'right'] as const) : [op.face]
      for (let y = op.y0; y <= op.y1; y++) {
        if (y < 0 || y >= sy) continue
        for (const face of faces) {
          if (face === 'front' || face === 'back') {
            const z = face === 'front' ? sz - 1 : 0
            for (let x = 1; x < sx - 1; x++) if (wx.has(x)) set(x, y, z, block)
          } else {
            const x = face === 'right' ? sx - 1 : 0
            for (let z = 1; z < sz - 1; z++) if (wz.has(z)) set(x, y, z, block)
          }
        }
      }
      return
    }
    case 'column': {
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block) return
      for (let y = op.y0; y <= op.y1; y++) set(op.x, y, op.z, block)
      return
    }
    case 'stairs_run': {
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block) return
      const [dx, dz] = op.direction === '+x' ? [1, 0] : op.direction === '-x' ? [-1, 0] : op.direction === '+z' ? [0, 1] : [0, -1]
      for (let s = 0; s < op.steps; s++) {
        set(op.from[0] + dx * s, op.from[1] + s, op.from[2] + dz * s, block)
      }
      return
    }
    case 'roof_gable': {
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block) return
      // Techo a dos aguas simple sobre la capa y: reduce 1 por lado cada nivel.
      let inset = 0
      for (let y = op.y; y < sy; y++) {
        const x0 = inset
        const x1 = sx - 1 - inset
        if (x0 > x1) break
        for (let z = 0; z < sz; z++) {
          for (let x = x0; x <= x1; x++) set(x, y, z, block)
        }
        inset += 1
      }
      return
    }
    case 'fill_sphere': {
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block) return
      const [cx, cy, cz] = op.center
      const r2 = op.radius * op.radius
      for (let y = cy - op.radius; y <= cy + op.radius; y++) {
        for (let z = cz - op.radius; z <= cz + op.radius; z++) {
          for (let x = cx - op.radius; x <= cx + op.radius; x++) {
            const d2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2
            if (d2 > r2) continue
            if (op.hollow && d2 < (op.radius - 1) ** 2) continue
            set(x, y, z, block)
          }
        }
      }
      return
    }
    case 'mirror': {
      if (op.axis === 'x') {
        for (let y = 0; y < sy; y++) {
          for (let z = 0; z < sz; z++) {
            for (let x = 0; x < Math.floor(sx / 2); x++) {
              const src = grid[y][z][x]
              if (src) grid[y][z][sx - 1 - x] = src
            }
          }
        }
      } else {
        for (let y = 0; y < sy; y++) {
          for (let z = 0; z < Math.floor(sz / 2); z++) {
            for (let x = 0; x < sx; x++) {
              const src = grid[y][z][x]
              if (src) grid[y][sz - 1 - z][x] = src
            }
          }
        }
      }
      return
    }
    case 'replace': {
      const find = normalizeBlockName(op.find)
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block || !find) return
      const [x0, y0, z0] = op.from
      const [x1, y1, z1] = op.to
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
          for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
            if (inBounds(x, y, z, size) && grid[y][z][x] === find) set(x, y, z, block)
          }
        }
      }
    }
  }
}

export function interpretRecipe(recipe: Recipe): InterpretResult {
  const errors: string[] = []
  const grid = emptyGrid(recipe.size)
  recipe.shell_ops.forEach((op, i) => {
    try {
      applyShellOp(grid, recipe.size, recipe.palette, op, i, errors)
    } catch (e) {
      errors.push(`op[${i}]: ${e instanceof Error ? e.message : 'falló'}`)
    }
  })
  // Trasera simétrica por defecto
  if (recipe.symmetry?.back === 'mirror_front') {
    const [sx, sy, sz] = recipe.size
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const src = grid[y][sz - 1][x]
        if (src) grid[y][0][x] = src
      }
    }
  }
  if (recipe.symmetry?.sides === 'mirror_x') {
    const [sx, sy, sz] = recipe.size
    for (let y = 0; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < Math.floor(sx / 2); x++) {
          const src = grid[y][z][sx - 1 - x]
          if (src) grid[y][z][x] = src
        }
      }
    }
  }
  return { grid, size: recipe.size, errors, appliedOps: recipe.shell_ops.length }
}

export function countBlocks(grid: VoxelGrid) {
  let n = 0
  for (const layer of grid) for (const row of layer) for (const c of row) if (c) n += 1
  return n
}
