import type { Recipe, ShellOp, Vec3 } from '../ai/schema'
import { normalizeBlockName } from './palette'

export type VoxelProps = Record<string, string>

/** Celda: id de bloque o id + estados (ej. losa alta {type:'top'}). */
export type Voxel = string | { name: string; props: VoxelProps }

export type VoxelGrid = (Voxel | null)[][][] // [y][z][x]

/** Nombre del bloque sin importar si lleva estados. */
export function voxelName(v: Voxel): string {
  return typeof v === 'string' ? v : v.name
}

/** Estados del bloque ({} si es id plano). */
export function voxelProps(v: Voxel): VoxelProps {
  return typeof v === 'string' ? {} : v.props
}

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

function windowStarts(len: number, w: number, gap: number, off = 0) {
  const starts: number[] = []
  const period = w + gap
  const usable = len - 2
  if (usable <= 0 || period <= 0) return starts
  const fullWindows = Math.max(1, Math.floor((usable + gap) / period))
  const totalWin = fullWindows * w + (fullWindows - 1) * gap
  const start = 1 + Math.max(0, Math.floor((usable - totalWin) / 2))
  for (let k = 0; k < fullWindows; k++) {
    const c = start + k * period
    if (c >= 1 && c + w - 1 < len - 1) starts.push(off + c)
  }
  // Respaldo: si ni una ventana completa cabe (ej. tira ribbon w=99),
  // se pinta igual y el llamador recorta por rango (banda completa).
  if (!starts.length && usable > 0) starts.push(off + 1)
  return starts
}

function windowCols(len: number, w: number, gap: number, off = 0) {
  const cols = new Set<number>()
  for (const s of windowStarts(len, w, gap, 0)) {
    for (let i = 0; i < w; i++) cols.add(off + s + i)
  }
  return cols
}

/** Inicios de ventana (para el compilador paramétrico). Exportado para testear. */
export function getWindowStarts(len: number, w: number, gap: number) {
  return windowStarts(len, w, gap, 0)
}

function applyShellOp(grid: VoxelGrid, size: Vec3, palette: Record<string, string>, op: ShellOp, index: number, errors: string[]) {
  const [sx, sy, sz] = size
  const set = (x: number, y: number, z: number, b: Voxel | null) => {
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
      const cell: Voxel = op.props && Object.keys(op.props).length ? { name: block, props: { ...op.props } } : block
      for (let z = Math.max(0, fz0); z <= Math.min(sz - 1, fz1); z++) {
        for (let x = Math.max(0, fx0); x <= Math.min(sx - 1, fx1); x++) set(x, op.y, z, cell)
      }
      return
    }
    case 'grid_windows': {
      const block = resolveBlock(op.block, palette, errors, index)
      if (!block) return
      const faces = (Array.isArray(op.face) ? op.face : [op.face]) as Array<'front' | 'back' | 'left' | 'right'>
      // Región opcional: permite pintar la fachada de un solo volumen.
      // Por defecto cubre toda la estructura (comportamiento original).
      const rx0 = op.x0 ?? 0
      const rx1 = op.x1 ?? sx - 1
      const rz0 = op.z0 ?? 0
      const rz1 = op.z1 ?? sz - 1
      // Columnas centradas en la región (volumen), no en toda la estructura.
      const wx = windowCols(rx1 - rx0 + 1, op.w, op.gap, rx0)
      const wz = windowCols(rz1 - rz0 + 1, op.w, op.gap, rz0)
      for (let y = op.y0; y <= op.y1; y++) {
        if (y < 0 || y >= sy) continue
        for (const face of faces) {
          if (face !== 'front' && face !== 'back' && face !== 'left' && face !== 'right') continue
          if (face === 'front' || face === 'back') {
            const z = face === 'front' ? sz - 1 : 0
            if (z < rz0 || z > rz1) continue
            for (let x = Math.max(1, rx0); x <= Math.min(sx - 2, rx1); x++) {
              if (wx.has(x)) set(x, y, z, block)
            }
          } else {
            const x = face === 'right' ? sx - 1 : 0
            if (x < rx0 || x > rx1) continue
            for (let z = Math.max(1, rz0); z <= Math.min(sz - 2, rz1); z++) {
              if (wz.has(z)) set(x, y, z, block)
            }
          }
        }
      }
      return
    }
    case 'custom_windows': {
      const wall = resolveBlock(op.wall, palette, errors, index)
      const glass = resolveBlock(op.glass, palette, errors, index)
      if (!wall || !glass) return
      const faces = (Array.isArray(op.face) ? op.face : [op.face]) as Array<'front' | 'back' | 'left' | 'right'>
      const rx0 = op.x0 ?? 0
      const rx1 = op.x1 ?? sx - 1
      const rz0 = op.z0 ?? 0
      const rz1 = op.z1 ?? sz - 1
      const patH = op.pattern.length
      const patW = Math.max(0, ...op.pattern.map((r) => r.length))
      if (!patH || !patW) return
      const paint = (x: number, y: number, z: number, cell: string) => {
        if (y < 0 || y >= sy) return
        if (cell === 'G') set(x, y, z, glass)
        else if (cell === 'W') set(x, y, z, wall)
      }
      for (let f = 0; f < op.floors; f++) {
        const bandY = op.shaftY0 + f * op.floorH + op.sill
        for (const face of faces) {
          if (face !== 'front' && face !== 'back' && face !== 'left' && face !== 'right') continue
          const horizontal = face === 'front' || face === 'back'
          const len = horizontal ? rx1 - rx0 + 1 : rz1 - rz0 + 1
          const off = horizontal ? rx0 : rz0
          for (const s of windowStarts(len, patW, op.gap, off)) {
            for (let dy = 0; dy < patH; dy++) {
              const row = op.pattern[dy]
              if (!row) continue
              for (let dx = 0; dx < row.length; dx++) {
                const cell = row[dx]
                if (cell !== 'G' && cell !== 'W') continue
                if (horizontal) {
                  const x = s + dx
                  if (x < Math.max(1, rx0) || x > Math.min(sx - 2, rx1)) continue
                  paint(x, bandY + dy, face === 'front' ? sz - 1 : 0, cell)
                } else {
                  const z = s + dx
                  if (z < Math.max(1, rz0) || z > Math.min(sz - 2, rz1)) continue
                  paint(face === 'right' ? sx - 1 : 0, bandY + dy, z, cell)
                }
              }
            }
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
      // Techo a dos aguas: reduce 1 por lado cada nivel, cumbrera según axis.
      const [fx0, fz0] = op.from ?? [0, 0]
      const [fx1, fz1] = op.to ?? [sx - 1, sz - 1]
      const gx0 = Math.max(0, Math.min(fx0, fx1))
      const gx1 = Math.min(sx - 1, Math.max(fx0, fx1))
      const gz0 = Math.max(0, Math.min(fz0, fz1))
      const gz1 = Math.min(sz - 1, Math.max(fz0, fz1))
      const alongZ = op.axis === 'z'
      let inset = 0
      for (let y = op.y; y < sy; y++) {
        if (alongZ) {
          const z0 = gz0 + inset
          const z1 = gz1 - inset
          if (z0 > z1) break
          for (let z = z0; z <= z1; z++) {
            for (let x = gx0; x <= gx1; x++) set(x, y, z, block)
          }
        } else {
          const x0 = gx0 + inset
          const x1 = gx1 - inset
          if (x0 > x1) break
          for (let z = gz0; z <= gz1; z++) {
            for (let x = x0; x <= x1; x++) set(x, y, z, block)
          }
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
            const cur = inBounds(x, y, z, size) ? grid[y][z][x] : null
            if (cur && voxelName(cur) === find) set(x, y, z, block)
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
