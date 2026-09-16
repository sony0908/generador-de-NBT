import type { Recipe, ShellOp, Vec3 } from '../ai/schema'
import type { Building, FacadeFaceName, Volume } from './types'
import { FACADE_FACES } from './types'

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

type Box = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

function normVolume(v: Volume): Box {
  const x0 = Math.min(v.from[0], v.to[0])
  const x1 = Math.max(v.from[0], v.to[0])
  const y0 = Math.min(v.from[1], v.to[1])
  const y1 = Math.max(v.from[1], v.to[1])
  const z0 = Math.min(v.from[2], v.to[2])
  const z1 = Math.max(v.from[2], v.to[2])
  for (const n of [x0, x1, y0, y1, z0, z1]) {
    if (!Number.isInteger(n)) throw new Error(`Volumen "${v.name}": usa coordenadas enteras.`)
    if (n < 0) throw new Error(`Volumen "${v.name}": no se permiten coordenadas negativas.`)
  }
  return { x0, y0, z0, x1, y1, z1 }
}

// ¿La cara F de V está tapada por otros volúmenes? (para no pintar ventanas al vacío interior)
function buriedFraction(v: Box, face: FacadeFaceName, others: Box[], yA: number, yB: number) {
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

// Caja de 1 bloque de grosor sobre una cara del volumen.
function faceBox(v: Box, face: FacadeFaceName, yA: number, yB: number, block: string): ShellOp {
  if (face === 'front') return { op: 'box', from: [v.x0, yA, v.z1], to: [v.x1, yB, v.z1], block }
  if (face === 'back') return { op: 'box', from: [v.x0, yA, v.z0], to: [v.x1, yB, v.z0], block }
  if (face === 'left') return { op: 'box', from: [v.x0, yA, v.z0], to: [v.x0, yB, v.z1], block }
  return { op: 'box', from: [v.x1, yA, v.z0], to: [v.x1, yB, v.z1], block }
}

export function compileBuilding(b: Building): CompileResult {
  if (!b.volumes.length) throw new Error('Agrega al menos un volumen (cubo).')
  const boxes = b.volumes.map(normVolume)
  const warnings: string[] = []
  const ops: ShellOp[] = []
  const usedBlocks = new Set<string>()

  const use = (id: string) => {
    usedBlocks.add(id)
    return id
  }

  // Tamaño = bbox + expansión del techo.
  let sx = 0
  let sy = 0
  let sz = 0
  const roofExtra = new Map<number, number>()
  boxes.forEach((v, i) => {
    const w = v.x1 - v.x0 + 1
    let extra = 0
    if (b.roof.style === 'flat_slab') extra = 2
    else if (b.roof.style === 'open_frame') extra = b.roof.height
    else extra = Math.ceil(w / 2) + 1
    roofExtra.set(i, extra)
    sx = Math.max(sx, v.x1 + 1)
    sy = Math.max(sy, v.y1 + 1 + extra)
    sz = Math.max(sz, v.z1 + 1)
  })
  if (sy > 384) throw new Error(`Altura total ${sy} excede el máximo de Minecraft (384). Baja pisos o volúmenes.`)
  const size: Vec3 = [sx, sy, sz]

  let floorsBuilt = 0

  boxes.forEach((v, vi) => {
    const vol = b.volumes[vi]
    const w = v.x1 - v.x0 + 1
    const d = v.z1 - v.z0 + 1
    const others = boxes.filter((_, i) => i !== vi)
    const grounded = v.y0 === 0
    const bh = grounded ? Math.min(Math.max(0, Math.round(b.base.height)), v.y1 - v.y0 + 1) : 0

    // Cáscara base (se repinta por caras más abajo).
    ops.push({ op: 'box', from: [v.x0, v.y0, v.z0], to: [v.x1, v.y1, v.z1], block: use(b.facade.front.wall), hollow: true })
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
          // Solo columnas en esquinas + arquitrabe superior.
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
            // Dintel sobre la puerta dentro de la banda de vidrio.
            seg(dx0, dx1, yA + doorH, yB - 1, b.base.glass)
            band(yB, yB, b.base.wall)
          } else {
            band(yA, Math.min(yA + doorH - 1, yB), b.base.wall)
            seg(dx0, dx1, yA + doorH, yB, b.base.wall)
          }
          return
        }
        // Sin puerta: pinta por bandas.
        if (b.base.style === 'retail_glass' && bh >= 3) {
          ops.push(faceBox(v, f, yA, yA, use(b.base.wall)))
          if (yB - 1 >= yA + 1) {
            const bandOp = faceBox(v, f, yA + 1, yB - 1, use(b.base.glass))
            ops.push(bandOp)
          }
          ops.push(faceBox(v, f, yB, yB, use(b.base.wall)))
        } else {
          ops.push(faceBox(v, f, yA, yB, use(b.base.style === 'retail_glass' ? b.base.glass : b.base.wall)))
        }
      }
      for (const f of FACADE_FACES) paintBaseFace(f)
    }

    // Fuste: pisos + ventanas.
    const shaftY0 = v.y0 + bh
    const shaftY1 = v.y1
    const shaftH = shaftY1 - shaftY0 + 1
    const fh = b.floors.floorHeight
    let actual = 0
    if (shaftH >= fh && b.floors.count > 0) {
      const fit = Math.floor(shaftH / fh)
      actual = Math.min(b.floors.count, fit)
      if (actual < b.floors.count) {
        warnings.push(
          `"${vol.name}": solo caben ${actual} de ${b.floors.count} pisos (fuste de ${shaftH}, piso de ${fh}). Agranda el volumen o baja el alto de piso.`,
        )
      }
      if (b.floors.slab) {
        for (let f = 0; f < actual; f++) {
          const slabY = shaftY0 + f * fh
          ops.push({ op: 'floor_slab', y: slabY, block: use(b.floors.slabBlock), from: [v.x0, v.z0], to: [v.x1, v.z1] })
        }
      }
      // Ventanas por cara (frente+atrás comparten patrón X, laterales el Z).
      const hPair = (['front', 'back'] as const).filter((f) => {
        const face = b.facade[f]
        if (face.pattern === 'solid') return false
        if (w < 3) return false
        if (buriedFraction(v, f, others, shaftY0, shaftY1) >= 0.7) {
          warnings.push(`Cara ${f} de "${vol.name}" tapada por otro volumen: sin ventanas.`)
          return false
        }
        return true
      })
      const vPair = (['left', 'right'] as const).filter((f) => {
        const face = b.facade[f]
        if (face.pattern === 'solid') return false
        if (d < 3) return false
        if (buriedFraction(v, f, others, shaftY0, shaftY1) >= 0.7) {
          warnings.push(`Cara ${f} de "${vol.name}" tapada por otro volumen: sin ventanas.`)
          return false
        }
        return true
      })
      // Solo agrupamos si comparten parámetros (mismo vidrio, w y gap).
      const keyOf = (f: (typeof hPair)[number] | (typeof vPair)[number]) => {
        const face = b.facade[f]
        return face.pattern === 'ribbon' ? `r|${face.glass}|${face.sill}` : `${face.windowW}|${face.gapX}|${face.glass}|${face.sill}`
      }
      const pushGroup = (faces: Array<'front' | 'back' | 'left' | 'right'>) => {
        if (!faces.length) return
        const rep = b.facade[faces[0]]
        const ribbon = rep.pattern === 'ribbon'
        ops.push({
          op: 'grid_windows',
          face: faces.length === 1 ? faces[0] : (faces as Array<'front' | 'back' | 'left' | 'right'>),
          y0: shaftY0 + Math.min(rep.sill, fh - 1),
          y1: shaftY1,
          w: ribbon ? 99 : Math.max(1, rep.windowW),
          gap: ribbon ? 0 : Math.max(0, rep.gapX),
          block: use(rep.glass),
          x0: v.x0,
          x1: v.x1,
          z0: v.z0,
          z1: v.z1,
        })
      }
      // Agrupa frente+atrás si coinciden, si no por separado (rara vez).
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
      for (const g of groupByKey(hPair)) pushGroup(g as Array<'front' | 'back' | 'left' | 'right'>)
      for (const g of groupByKey(vPair)) pushGroup(g as Array<'front' | 'back' | 'left' | 'right'>)
      floorsBuilt += actual
    } else if (b.floors.count > 0 && shaftH > 0) {
      warnings.push(`"${vol.name}": fuste de ${shaftH} bloques, no cabe ni un piso de ${fh}.`)
    }

    // Techo.
    const roofBase = v.y1 + 1
    if (b.roof.style === 'flat_slab') {
      ops.push({ op: 'floor_slab', y: roofBase, block: use(b.roof.slab), from: [v.x0, v.z0], to: [v.x1, v.z1] })
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
      ops.push({ op: 'roof_gable', y: roofBase, block: use(b.roof.trim), from: [v.x0, v.z0], to: [v.x1, v.z1] })
    }
  })

  if (ops.length > 120) {
    throw new Error(
      `El diseño genera ${ops.length} operaciones (máx 120). Baja pisos, quita volúmenes o usa losas más espaciadas.`,
    )
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
    stats: { volumes: boxes.length, floorsBuilt, floorsRequested: b.floors.count, ops: ops.length, size },
  }
}
