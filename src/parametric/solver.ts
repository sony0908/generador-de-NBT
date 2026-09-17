import type { Building, FacadeFace } from './types'
import type { Vec3 } from '../ai/schema'

// Solver forma → bloques:
// - Vertical: los pisos mandan (altura = pisos × alto). Cada volumen se
//   redondea a pisos enteros para conservar la forma con losas alineadas.
// - Horizontal: la fachada manda. El ancho se ajusta al múltiplo simétrico
//   más cercano de la regla (2×margen + n×ventana + (n−1)×espacio), así las
//   dos esquinas siempre terminan igual. Solo se ensancha (nunca se achica),
//   así los cubos que se tocaban en la forma siguen tocándose.

export type SolvedBox = {
  volId: string
  name: string
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  /** Pisos reales construidos en este volumen. */
  volFloors: number
  /** Primera y última fila del fuste (zona de ventanas). */
  shaftY0: number
  shaftY1: number
  grounded: boolean
}

export type SolveResult = {
  boxes: SolvedBox[]
  shaftH: number
  baseH: number
  warnings: string[]
}

const clampShare = (n: number) => Math.min(1, Math.max(0, n || 0))

/** Ancho simétrico mínimo ≥ objetivo según la regla de fachada. */
export function snapSymmetricWidth(target: number, face: FacadeFace) {
  const t = Math.max(1, Math.round(target))
  if (face.pattern !== 'punched_grid') return { width: Math.max(t, 3), n: 0 }
  const m = Math.max(0, Math.round(face.margin))
  const w = Math.max(1, Math.round(face.windowW))
  const g = Math.max(0, Math.round(face.gapX))
  let n = 1
  for (;;) {
    const width = 2 * m + n * w + (n - 1) * g
    if (width >= t) return { width, n }
    n += 1
    if (n > 200) return { width: 2 * m + n * w + (n - 1) * g, n }
  }
}

export function solveShape(b: Building): SolveResult {
  if (!b.volumes.length) throw new Error('Agrega al menos un volumen (cubo).')
  const warnings: string[] = []
  const fh = b.floors.floorHeight
  const count = Math.max(1, Math.round(b.floors.count))
  const shaftH = count * fh
  const anyGrounded = b.volumes.some((v) => v.grounded)
  const baseH = anyGrounded ? Math.max(0, Math.round(b.base.height)) : 0
  if (baseH >= shaftH) {
    throw new Error(`La base (${baseH}) ocupa toda la altura de pisos (${shaftH}). Baja la base o sube pisos.`)
  }

  // Reglas horizontales: la cara frontal manda en X, la lateral izq. en Z.
  const fx = b.facade.front
  const fz = b.facade.left
  for (const [a, c] of [['front', 'back'], ['left', 'right']] as const) {
    const A = b.facade[a]
    const C = b.facade[c]
    if (A.pattern !== C.pattern || A.windowW !== C.windowW || A.gapX !== C.gapX || A.margin !== C.margin) {
      warnings.push(`Caras ${a}/${c} con reglas distintas: el ancho lo marca ${a}.`)
    }
  }

  const boxes: SolvedBox[] = []
  for (const v of b.volumes) {
    const w = Math.max(1, Math.round(v.w))
    const d = Math.max(1, Math.round(v.d))
    const x = Math.max(0, Math.round(v.x))
    const z = Math.max(0, Math.round(v.z))

    // Vertical por pisos (snap a múltiplos para alinear losas).
    let y0: number
    let volFloors: number
    if (v.grounded) {
      y0 = 0
      volFloors = clampShare(v.hShare) >= 0.999 ? count : Math.max(1, Math.round(clampShare(v.hShare) * count))
    } else {
      y0 = baseH + Math.round(clampShare(v.yShare) * count) * fh
      volFloors = Math.max(1, Math.round(clampShare(v.hShare) * count))
    }
    const shaftY0 = v.grounded ? baseH : y0
    const top = shaftY0 + volFloors * fh - 1
    if (volFloors < Math.round(clampShare(v.hShare) * count) && !v.grounded) {
      warnings.push(`"${v.name}": altura ajustada a ${volFloors} piso(s) para alinear losas.`)
    }

    // Horizontal por reglas simétricas (solo ensancha).
    const sx = snapSymmetricWidth(w, fx)
    const sz = snapSymmetricWidth(d, fz)
    if (sx.width !== w) {
      warnings.push(`"${v.name}": ancho ${w} → ${sx.width} por regla de fachada (${sx.n} ventanas, esquinas de ${Math.max(0, Math.round(fx.margin))}).`)
    }
    if (sz.width !== d) {
      warnings.push(`"${v.name}": fondo ${d} → ${sz.width} por regla de fachada.`)
    }

    boxes.push({
      volId: v.id,
      name: v.name,
      x0: x,
      y0,
      z0: z,
      x1: x + sx.width - 1,
      y1: top,
      z1: z + sz.width - 1,
      volFloors,
      shaftY0,
      shaftY1: top,
      grounded: v.grounded,
    })
  }

  const size: Vec3 = [0, 0, 0]
  for (const box of boxes) {
    size[0] = Math.max(size[0], box.x1 + 1)
    size[1] = Math.max(size[1], box.y1 + 1)
    size[2] = Math.max(size[2], box.z1 + 1)
  }

  return { boxes, shaftH, baseH, warnings }
}
