import { Int32, write } from 'nbtify'
import { splitStructureRegions, type StructureSize } from '../generator/geometry'
import { isVanillaBlock, normalizeBlockName } from './palette'
import { voxelName, voxelProps, type VoxelGrid } from './interpreter'
import type { Vec3 } from '../ai/schema'

export type NbtPart = { index: number; offset: Vec3; size: Vec3; bytes: Uint8Array; blocks: number }

export type GridToNbtResult = {
  parts: NbtPart[]
  palette: string[]
  totalBlocks: number
  removed: { name: string; count: number }[]
  multiPart: boolean
}

// Convierte el grid a uno o varios .nbt (split automático si un eje >48).
export async function gridToNbt(grid: VoxelGrid, size: Vec3): Promise<GridToNbtResult> {
  const [sx, sy, sz] = size
  const palette: { name: string; props: Record<string, string> }[] = []
  const paletteIndex = new Map<string, number>()
  const removed = new Map<string, number>()
  type Entry = { pos: Vec3; state: number }
  const entries: Entry[] = []

  const getIndex = (name: string, props: Record<string, string>) => {
    const key = name + '\u0000' + Object.entries(props).sort().map(([k, v]) => k + '=' + v).join(',')
    let idx = paletteIndex.get(key)
    if (idx === undefined) {
      idx = palette.length
      palette.push({ name, props: { ...props } })
      paletteIndex.set(key, idx)
    }
    return idx
  }

  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const raw = grid[y][z][x]
        if (!raw) continue
        const norm = normalizeBlockName(voxelName(raw))
        if (!norm) continue
        if (!isVanillaBlock(norm)) {
          removed.set(norm, (removed.get(norm) ?? 0) + 1)
          continue
        }
        entries.push({ pos: [x, y, z], state: getIndex(norm, voxelProps(raw)) })
      }
    }
  }

  if (!entries.length) throw new Error('El grid no contiene bloques vanilla válidos.')

  const regions = splitStructureRegions([sx, sy, sz] as StructureSize)
  const parts: NbtPart[] = []

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i]
    const [ox, oy, oz] = region.offset
    const [rx, ry, rz] = region.size
    const regionBlocks = entries.filter(
      ({ pos }) =>
        pos[0] >= ox && pos[0] < ox + rx && pos[1] >= oy && pos[1] < oy + ry && pos[2] >= oz && pos[2] < oz + rz,
    )
    if (!regionBlocks.length) continue
    const root = {
      DataVersion: 3953,
      size: [new Int32(rx), new Int32(ry), new Int32(rz)],
      palette: palette.map((entry) =>
        Object.keys(entry.props).length
          ? { Name: entry.name, Properties: { ...entry.props } }
          : { Name: entry.name },
      ),
      blocks: regionBlocks.map(({ pos, state }) => ({
        pos: [new Int32(pos[0] - ox), new Int32(pos[1] - oy), new Int32(pos[2] - oz)],
        state: new Int32(state),
      })),
      entities: [],
    }
    const bytes = (await write(root, { endian: 'big', rootName: '' })) as Uint8Array
    parts.push({ index: parts.length, offset: [ox, oy, oz], size: [rx, ry, rz], bytes, blocks: regionBlocks.length })
  }

  return {
    parts,
    palette: palette.map((entry) => {
      const props = Object.entries(entry.props).map(([k, v]) => k + '=' + v).join(',')
      return props ? `${entry.name} [${props}]` : entry.name
    }),
    totalBlocks: entries.length,
    removed: [...removed.entries()].map(([name, count]) => ({ name, count })),
    multiPart: parts.length > 1,
  }
}

export function placementGuide(parts: NbtPart[]) {
  return parts
    .map((p) => `parte_${p.index}.nbt -> offset [${p.offset.join(', ')}] tamaño [${p.size.join('x')}] (${p.blocks} bloques)`)
    .join('\n')
}
