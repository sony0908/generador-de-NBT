import type { Vec3 } from '../ai/schema'

// Generador paramétrico escalable: el edificio se diseña como volúmenes
// (cubos por ahora), luego pisos, fachada por plantillas y base.
// Todo determinista: el compilador traduce esto a shell_ops del intérprete.

export type Volume = {
  id: string
  name: string
  /** Esquina mínima (inclusive). */
  from: Vec3
  /** Esquina máxima (inclusive). Solo cubos por ahora. */
  to: Vec3
}

export type FloorSpec = {
  count: number
  floorHeight: 2 | 3 | 4 | 5
  slab: boolean
  slabBlock: string
}

export type FacadePattern = 'punched_grid' | 'ribbon' | 'solid'

export type FacadeFaceName = 'front' | 'back' | 'left' | 'right'

export const FACADE_FACES: FacadeFaceName[] = ['front', 'back', 'left', 'right']

export const FACADE_FACE_LABELS: Record<FacadeFaceName, string> = {
  front: 'Frontal',
  back: 'Trasera',
  left: 'Lateral izq.',
  right: 'Lateral der.',
}

export type FacadeFace = {
  pattern: FacadePattern
  /** Ancho de ventana en bloques (punched_grid). */
  windowW: number
  /** Separación horizontal entre ventanas. */
  gapX: number
  /** Filas de muro sobre la losa antes del vidrio (controla el alto de ventana). */
  sill: number
  wall: string
  glass: string
}

export type FacadeSpec = Record<FacadeFaceName, FacadeFace>

export type BaseStyle = 'retail_glass' | 'entrance' | 'pilotis' | 'solid'

export const BASE_STYLES: { id: BaseStyle; label: string; hint: string }[] = [
  { id: 'retail_glass', label: 'Vidriera comercial', hint: 'Banda de vidrio con zócalo, ideal planta baja' },
  { id: 'entrance', label: 'Entrada marcada', hint: 'Muro con puerta de N bloques en la cara elegida' },
  { id: 'pilotis', label: 'Pilotis', hint: 'Solo columnas en esquinas + losa superior' },
  { id: 'solid', label: 'Maciza', hint: 'Muro ciego en toda la base' },
]

export type BaseSpec = {
  height: number
  style: BaseStyle
  wall: string
  glass: string
  entranceFace: FacadeFaceName
  entranceW: number
}

export type RoofStyle = 'flat_slab' | 'open_frame' | 'gable'

export const ROOF_STYLES: { id: RoofStyle; label: string; hint: string }[] = [
  { id: 'flat_slab', label: 'Losa + parapeto', hint: 'Azotea plana con borde de 1 bloque' },
  { id: 'open_frame', label: 'Marco abierto', hint: 'Corona tipo la torre de referencia' },
  { id: 'gable', label: 'Dos aguas', hint: 'Techo a dos aguas sobre cada volumen' },
]

export type RoofSpec = {
  style: RoofStyle
  height: number
  trim: string
  slab: string
}

export type Building = {
  volumes: Volume[]
  floors: FloorSpec
  facade: FacadeSpec
  base: BaseSpec
  roof: RoofSpec
}

let volumeSeq = 2

export function newVolumeId() {
  volumeSeq += 1
  return `vol-${volumeSeq}`
}

export function defaultFacadeFace(wall: string, glass: string): FacadeFace {
  return { pattern: 'punched_grid', windowW: 2, gapX: 2, sill: 1, wall, glass }
}

export function defaultBuilding(): Building {
  const wall = 'minecraft:white_concrete'
  const glass = 'minecraft:light_blue_stained_glass'
  return {
    volumes: [{ id: 'vol-1', name: 'Torre', from: [0, 0, 0], to: [10, 29, 10] }],
    floors: { count: 8, floorHeight: 3, slab: true, slabBlock: 'minecraft:stone_slab' },
    facade: {
      front: defaultFacadeFace(wall, glass),
      back: defaultFacadeFace(wall, glass),
      left: defaultFacadeFace(wall, glass),
      right: defaultFacadeFace(wall, glass),
    },
    base: { height: 3, style: 'retail_glass', wall, glass, entranceFace: 'front', entranceW: 3 },
    roof: { style: 'open_frame', height: 2, trim: wall, slab: 'minecraft:stone_slab' },
  }
}

/** Bounding box de todos los volúmenes (origen en 0,0,0). */
export function buildingSize(b: Building): Vec3 {
  if (!b.volumes.length) return [1, 1, 1]
  let x1 = 0
  let y1 = 0
  let z1 = 0
  for (const v of b.volumes) {
    x1 = Math.max(x1, v.to[0])
    y1 = Math.max(y1, v.to[1])
    z1 = Math.max(z1, v.to[2])
  }
  return [x1 + 1, y1 + 1, z1 + 1]
}
