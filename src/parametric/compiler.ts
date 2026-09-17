import type { Recipe, ShellOp, Vec3 } from '../ai/schema'
import type { VoxelGrid } from '../voxel/interpreter'
import type { Building, FacadeFaceName } from './types'
import { FACADE_FACES, resolveFloorAt } from './types'
import { solveShape, type SolvedBox } from './solver'

export type CompileStats = {
  volumes: number
  floorsBuilt: number
  floorsRequested: number
  ops: number
  size: Vec3
}

export type CompileResult = {
  recipe: Recipe
  warnings: string[]
  stats: CompileStats
}

/** Tope técnico (memoria del navegador), no de diseño: 20M de celdas. */
export const MAX_CELLS = 20_000_000

type Box = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

// Caja de 1 bloque de grosor sobre una cara del volumen.
function faceBox(v: Box, face: FacadeFaceName, yA: number, yB: number, block: string): ShellOp {
  if (face === 'front') return { op: 'box', from: [v.x0, yA, v.z1], to: [v.x1, yB, v.z1], block }
  if (face === 'back') return { op: 'box', from: [v.x0, yA, v.z0], to: [v.x1, yB, v.z0], block }
  if (face === 'left') return { op: 'box', from: [v.x0, yA, v.z0], to: [v.x0, yB, v.z1], block }
  return { op: 'box', from: [v.x1, yA, v.z0], to: [v.x1, yB, v.z1], block }
}

// ¿La cara F de V está tapada por otros volúmenes? (sin ventanas al interior)
function buriedFraction(v: SolvedBox, face: FacadeFaceName, others: SolvedBox[], yA: number, yB: number) {
  let faceArea = 0
  let covered = 0
  if (face === 'front' || face === 'back') {
    const z = face === 'front' ? v.z1 : v.z0
    faceArea = (v.x1 - v.x0 + 1) * (yB - yA + 1)
    for (const u of others) {
      if (u.z0 <= z && z <= u.z1) {
        const ox0 = Math.max(v.x0, u.x0)
        const ox1 = Math.min(v.x1, u.x1)
        const oy0 = Math.max(yA, u.y0)
        const oy1 = Math.min(yB, u.y1)
        if (ox1 >= ox0 && oy1 >= oy0) covered += (ox1 - ox0 + 1) * (oy1 - oy0 + 1)
      }
    }
  } else {
    const x = face === 'right' ? v.x1 : v.x0
    faceArea = (v.z1 - v.z0 + 1) * (yB - yA + 1)
    for (const u of others) {
      if (u.x0 <= x && x <= u.x1) {
        const oz0 = Math.max(v.z0, u.z0)
        const oz1 = Math.min(v.z1, u.z1)
        const oy0 = Math.max(yA, u.y0)
        const oy1 = Math.min(yB, u.y1)
        if (oz1 >= oz0 && oy1 >= oy0) covered += (oz1 - oz0 + 1) * (oy1 - oy0 + 1)
      }
    }
  }
  return faceArea > 0 ? covered / faceArea : 1
}

export function compileBuilding(b: Building): CompileResult {
  const solved = solveShape(b)
  const warnings: string[] = [...solved.warnings]
  const ops: ShellOp[] = []
  const usedBlocks = new Set<string>()
  const use = (id: string) => {
    usedBlocks.add(id)
    return id
  }

  const fh = b.floors.floorHeight
  // La losa física la marca la cara frontal; el resto debe coincidir.
  const floorAt = resolveFloorAt(b.facade.front.floorAt, fh)
  for (const f of FACADE_FACES) {
    if (Math.round(b.facade[f].floorAt) !== Math.round(b.facade.front.floorAt)) {
      warnings.push(`Losa en fila ${floorAt} (la marca la cara frontal).`)
      break
    }
  }

  // Tamaño = bbox + expansión del techo. Sin topes de diseño.
  let sx = 0
  let sy = 0
  let sz = 0
  const byId = new Map(b.volumes.map((v) => [v.id, v]))
  const roofExtra = new Map<string, number>()
  for (const v of solved.boxes) {
    const w = v.x1 - v.x0 + 1
    const d = v.z1 - v.z0 + 1
    const gableDir = byId.get(v.volId)?.gableDir ?? 'x'
    let extra = 0
    if (b.roof.style === 'flat_slab') extra = 2
    else if (b.roof.style === 'open_frame') extra = Math.max(1, Math.round(b.roof.height))
    else extra = Math.ceil((gableDir === 'z' ? d : w) / 2) + 1
    roofExtra.set(v.volId, extra)
    sx = Math.max(sx, v.x1 + 1)
    sy = Math.max(sy, v.y1 + 1 + extra)
    sz = Math.max(sz, v.z1 + 1)
  }
  const size: Vec3 = [sx, sy, sz]
  if (sx * sy * sz > MAX_CELLS) {
    throw new Error(
      `Diseño de ${(sx * sy * sz).toLocaleString('es')} celdas: excede la memoria del navegador. Baja pisos o divide en varios edificios.`,
    )
  }

  let floorsBuilt = 0

  for (const v of solved.boxes) {
    const w = v.x1 - v.x0 + 1
    const d = v.z1 - v.z0 + 1
    const others = solved.boxes.filter((o) => o.volId !== v.volId)
    const bh = v.grounded ? Math.min(Math.max(0, Math.round(b.base.height)), v.y1 - v.y0 + 1) : 0

    // Cáscara SIN tapa superior (el techo la cubre; evita un piso macizo
    // invisible y conserva la simetría vertical). El anillo perimetral
    // superior lo pintan las caras. La base sí lleva placa (suelo).
    const shellTop = v.y1 > v.y0 ? v.y1 - 1 : v.y1
    ops.push({ op: 'box', from: [v.x0, v.y0, v.z0], to: [v.x1, shellTop, v.z1], block: use(b.facade.front.wall), hollow: true })
    for (const f of FACADE_FACES) {
      ops.push(faceBox(v, f, v.y0, v.y1, use(b.facade[f].wall)))
    }

    // Base / planta baja.
    if (bh > 0) {
      const yA = v.y0
      const yB = v.y0 + bh - 1
      const paintBaseFace = (f: FacadeFaceName) => {
        if (b.base.style === 'solid') {
          ops.push(faceBox(v, f, yA, yB, use(b.base.wall)))
          return
        }
        if (b.base.style === 'pilotis') {
          const corners: Array<[number, number]> =
            f === 'front' ? [[v.x0, v.z1], [v.x1, v.z1]]
            : f === 'back' ? [[v.x0, v.z0], [v.x1, v.z0]]
            : f === 'left' ? [[v.x0, v.z0], [v.x0, v.z1]]
            : [[v.x1, v.z0], [v.x1, v.z1]]
          for (const [cx, cz] of corners) {
            ops.push({ op: 'column', x: cx, z: cz, y0: yA, y1: yB, block: use(b.base.wall) })
          }
          ops.push(faceBox(v, f, yB, yB, use(b.base.wall)))
          return
        }
        // Puerta en la cara de entrada: segmentos laterales + dintel.
        const isEntrance = f === b.base.entranceFace
        const doorH = Math.min(3, bh)
        if (isEntrance && (b.base.style === 'entrance' || b.base.style === 'retail_glass')) {
          const span: [number, number] = f === 'front' || f === 'back' ? [v.x0, v.x1] : [v.z0, v.z1]
          const cx = Math.floor((span[0] + span[1]) / 2)
          const dw = Math.max(1, Math.min(Math.floor(b.base.entranceW / 2), Math.floor((span[1] - span[0]) / 2)))
          const dx0 = cx - dw
          const dx1 = cx + (b.base.entranceW % 2 === 0 ? dw - 1 : dw)
          const seg = (a0: number, a1: number, r0: number, r1: number, block: string) => {
            if (a1 < a0 || r1 < r0) return
            if (f === 'front') ops.push({ op: 'box', from: [a0, r0, v.z1], to: [a1, r1, v.z1], block: use(block) })
            else if (f === 'back') ops.push({ op: 'box', from: [a0, r0, v.z0], to: [a1, r1, v.z0], block: use(block) })
            else if (f === 'left') ops.push({ op: 'box', from: [v.x0, r0, a0], to: [v.x0, r1, a1], block: use(block) })
            else ops.push({ op: 'box', from: [v.x1, r0, a0], to: [v.x1, r1, a1], block: use(block) })
          }
          const band = (r0: number, r1: number, block: string) => {
            seg(span[0], dx0 - 1, r0, r1, block)
            seg(dx1 + 1, span[1], r0, r1, block)
          }
          if (b.base.style === 'retail_glass' && bh >= 3) {
            band(yA, yA, b.base.wall)
            band(yA + 1, Math.min(yA + doorH - 1, yB - 1), b.base.glass)
            seg(dx0, dx1, yA + doorH, yB - 1, b.base.glass)
            band(yB, yB, b.base.wall)
          } else {
            band(yA, Math.min(yA + doorH - 1, yB), b.base.wall)
            seg(dx0, dx1, yA + doorH, yB, b.base.wall)
          }
          return
        }
        if (b.base.style === 'retail_glass' && bh >= 3) {
          ops.push(faceBox(v, f, yA, yA, use(b.base.wall)))
          if (yB - 1 >= yA + 1) ops.push(faceBox(v, f, yA + 1, yB - 1, use(b.base.glass)))
          ops.push(faceBox(v, f, yB, yB, use(b.base.wall)))
        } else {
          ops.push(faceBox(v, f, yA, yB, use(b.base.style === 'retail_glass' ? b.base.glass : b.base.wall)))
        }
      }
      for (const f of FACADE_FACES) paintBaseFace(f)
    }

    // Fuste: pisos + ventanas (simetría vertical: antepecho espejado arriba).
    const shaftY0 = v.shaftY0
    const shaftY1 = v.shaftY1
    const actual = v.volFloors
    if (b.floors.slab) {
      const inset = b.floors.inset && w >= 3 && d >= 3
      if (b.floors.inset && (w < 3 || d < 3)) {
        warnings.push(`"${v.name}": muy angosto para piso interior, se usa huella completa.`)
      }
      for (let f = 0; f < actual; f++) {
        const slabY = shaftY0 + f * fh + floorAt
        if (slabY > shaftY0 + (f + 1) * fh - 1) continue
        ops.push({
          op: 'floor_slab',
          y: slabY,
          block: use(b.floors.slabBlock),
          from: inset ? [v.x0 + 1, v.z0 + 1] : [v.x0, v.z0],
          to: inset ? [v.x1 - 1, v.z1 - 1] : [v.x1, v.z1],
          props: { type: 'top' },
        })
      }
    }
    const hPair = (['front', 'back'] as const).filter((f) => {
      const face = b.facade[f]
      if (face.pattern === 'solid' || w < 3) return false
      if (buriedFraction(v, f, others, shaftY0, shaftY1) >= 0.7) {
        warnings.push(`Cara ${f} de "${v.name}" tapada por otro volumen: sin ventanas.`)
        return false
      }
      return true
    })
    const vPair = (['left', 'right'] as const).filter((f) => {
      const face = b.facade[f]
      if (face.pattern === 'solid' || d < 3) return false
      if (buriedFraction(v, f, others, shaftY0, shaftY1) >= 0.7) {
        warnings.push(`Cara ${f} de "${v.name}" tapada por otro volumen: sin ventanas.`)
        return false
      }
      return true
    })
    const keyOf = (f: (typeof hPair)[number] | (typeof vPair)[number]) => {
      const face = b.facade[f]
      if (face.pattern === 'ribbon') return `r|${face.glass}|${face.sill}`
      const custom = face.custom?.length ? JSON.stringify(face.custom) : ''
      return `${face.windowW}|${face.gapX}|${face.glass}|${face.sill}|${face.floorAt}|${custom}`
    }
    // Ventanas primero, losas después (la losa pisa su fila).
    const pushGroup = (faces: Array<'front' | 'back' | 'left' | 'right'>) => {
      if (!faces.length) return
      const rep = b.facade[faces[0]]
      const ribbon = rep.pattern === 'ribbon'
      const sill = Math.min(Math.max(0, Math.round(rep.sill)), fh - 1)
      const y0 = shaftY0 + sill
      const y1 = shaftY1 - sill
      if (y1 < y0) {
        warnings.push(`"${v.name}": antepecho ${sill} no cabe en el fuste, cara sin ventanas.`)
        return
      }
      const region = { x0: v.x0, x1: v.x1, z0: v.z0, z1: v.z1 }
      const faceParam = faces.length === 1 ? faces[0] : (faces as Array<'front' | 'back' | 'left' | 'right'>)
      const custom = !ribbon && rep.custom?.length ? rep.custom.slice(0, fh) : null
      if (custom) {
        const patH = custom.length
        ops.push({
          op: 'custom_windows',
          face: faceParam,
          ...region,
          shaftY0,
          floors: actual,
          floorH: fh,
          // Centrado vertical: simetría total del pixel-art en su banda.
          sill: Math.max(0, Math.floor((fh - patH) / 2)),
          gap: Math.max(0, Math.round(rep.gapX)),
          pattern: custom,
          wall: use(rep.wall),
          glass: use(rep.glass),
        })
        return
      }
      ops.push({
        op: 'grid_windows',
        face: faceParam,
        y0,
        y1,
        w: ribbon ? 99 : Math.max(1, Math.round(rep.windowW)),
        gap: ribbon ? 0 : Math.max(0, Math.round(rep.gapX)),
        block: use(rep.glass),
        ...region,
      })
    }
    const groupByKey = (faces: Array<'front' | 'back'> | Array<'left' | 'right'>) => {
      const groups = new Map<string, typeof faces>()
      for (const f of faces) {
        const k = keyOf(f)
        const g = groups.get(k)
        if (g) (g as string[]).push(f)
        else groups.set(k, [f] as unknown as typeof faces)
      }
      return [...groups.values()]
    }
    // Orden: losas y luego ventanas (con inset no se tocan; sin inset la
    // ventana recorta la losa solo en sus columnas, como remate).
    for (const g of groupByKey(hPair)) pushGroup(g as Array<'front' | 'back' | 'left' | 'right'>)
    for (const g of groupByKey(vPair)) pushGroup(g as Array<'front' | 'back' | 'left' | 'right'>)
    floorsBuilt += actual

    // Techo.
    const roofBase = v.y1 + 1
    const gableDir = byId.get(v.volId)?.gableDir ?? 'x'
    if (b.roof.style === 'flat_slab') {
      ops.push({ op: 'floor_slab', y: roofBase, block: use(b.roof.slab), from: [v.x0, v.z0], to: [v.x1, v.z1], props: { type: 'top' } })
      for (const f of FACADE_FACES) {
        ops.push(faceBox(v, f, roofBase + 1, roofBase + 1, use(b.roof.trim)))
      }
    } else if (b.roof.style === 'open_frame') {
      const rh = Math.max(1, Math.round(b.roof.height))
      const corners: Array<[number, number]> = [[v.x0, v.z0], [v.x1, v.z0], [v.x0, v.z1], [v.x1, v.z1]]
      for (const [cx, cz] of corners) {
        ops.push({ op: 'column', x: cx, z: cz, y0: roofBase, y1: roofBase + rh - 1, block: use(b.roof.trim) })
      }
      for (const f of FACADE_FACES) {
        ops.push(faceBox(v, f, roofBase + rh - 1, roofBase + rh - 1, use(b.roof.trim)))
      }
    } else {
      ops.push({ op: 'roof_gable', y: roofBase, block: use(b.roof.trim), from: [v.x0, v.z0], to: [v.x1, v.z1], axis: gableDir })
    }
  }

  const palette: Record<string, string> = {}
  ;[...usedBlocks].forEach((id, i) => {
    palette['b' + i] = id
  })

  const recipe: Recipe = {
    size,
    palette,
    symmetry: { back: 'custom' },
    facade: { style: 'parametric' },
    shell_ops: ops,
    interior_ops: [],
  }

  return {
    recipe,
    warnings,
    stats: { volumes: solved.boxes.length, floorsBuilt, floorsRequested: b.floors.count, ops: ops.length, size },
  }
}

/**
 * Quita paredes internas: todo bloque con sus 6 vecinos ocupados se vacía.
 * Une cubos pegados en un solo interior hueco. Una sola pasada (dos fases)
 * para no colapsar muros de 2 de grosor: la capa exterior siempre sobrevive
 * porque da al aire.
 * @returns nº de bloques eliminados.
 */
export function carveEnclosed(grid: VoxelGrid, size: Vec3) {
  const [sx, sy, sz] = size
  const solid = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return false
    return grid[y][z][x] !== null
  }
  const kill: Array<[number, number, number]> = []
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        if (!grid[y][z][x]) continue
        if (
          solid(x + 1, y, z) && solid(x - 1, y, z) &&
          solid(x, y + 1, z) && solid(x, y - 1, z) &&
          solid(x, y, z + 1) && solid(x, y, z - 1)
        ) {
          kill.push([x, y, z])
        }
      }
    }
  }
  for (const [x, y, z] of kill) grid[y][z][x] = null
  return kill.length
}
