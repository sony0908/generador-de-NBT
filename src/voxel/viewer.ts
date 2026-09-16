import type { ViewerModel } from '../generator/viewerTypes'
import { blockColor } from './palette'
import type { VoxelGrid } from './interpreter'
import type { Vec3 } from '../ai/schema'

export function gridToViewer(grid: VoxelGrid, size: Vec3, key = 'estructura'): ViewerModel {
  const [sx, sy, sz] = size
  const positions: number[] = []
  const states: number[] = []
  const paletteIndex = new Map<string, number>()
  const palette: ViewerModel['palette'] = []
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const name = grid[y][z][x]
        if (!name) continue
        let idx = paletteIndex.get(name)
        if (idx === undefined) {
          idx = palette.length
          palette.push({ name, color: blockColor(name), properties: {} })
          paletteIndex.set(name, idx)
        }
        positions.push(x, y, z)
        states.push(idx)
      }
    }
  }
  return { key, size, positions: Int32Array.from(positions), states: Uint32Array.from(states), palette }
}
