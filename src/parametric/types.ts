import type { Vec3 } from '../ai/schema'

// Generador paramétrico escalable:
// - Volumetría: FORMA en tramos (proporción + adosamiento, no bloques).
// - Pisos: dan la medida vertical (altura = pisos × alto).
// - Fachada: da la medida horizontal (las reglas simétricas ajustan el ancho).
// Todo determinista: el solver resuelve y el compilador emite shell_ops.

export type Volume = {
  id: string
  name: string
  /** Posición y tamaño en TRAMOS (forma, no bloques). Mínimo 1. */
  x: number
  z: number
  w: number
  d: number
  /** Fracción de inicio vertical (0–1 del fuste). Solo si no toca suelo. */
  yShare: number
  /** Fracción de altura vertical (0–1 del fuste). Se redondea a pisos enteros. */
  hShare: number
  /** Nace del suelo (reserva filas de base) o flota adosado. */
  grounded: boolean
  /** Orientación del techo a dos aguas de este volumen. */
  gableDir: 'x' | 'z'
}

export type FloorSpec = {
  count: number
  floorHeight: 2 | 3 | 4 | 5
  slab: boolean
  slabBlock: string
  /** true = piso solo interior (no toca el contorno del edificio). */
  inset: boolean
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
  /** Bloques de esquina a cada lado (SIMÉTRICO: igual en ambas esquinas). */
  margin: number
  /** Filas de muro sobre la losa antes del vidrio (se espeja arriba: simetría vertical). */
  sill: number
  /**
   * Fila de la losa dentro de cada piso. La declara la plantilla.
   * -1 = centrada (simetría vertical exacta del ritmo de losas).
   * La losa física la marca la cara frontal; si otras caras difieren se avisa.
   */
  floorAt: number
  wall: string
  glass: string
  /**
   * Diseño pixel-art por ventana (filas de arriba hacia abajo).
   * Celdas: 'G' vidrio, 'W' muro, '.' no tocar.
   * null = ventana maciza de vidrio. Solo vale con pattern 'punched_grid'.
   */
  custom?: string[][] | null
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
  { id: 'gable', label: 'Dos aguas', hint: 'Techo a dos aguas (orientable por volumen)' },
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
  /** Quita paredes internas donde los cubos se pegan (recomendado). */
  hollowUnion: boolean
}

let volumeSeq = 2

export function newVolumeId() {
  volumeSeq += 1
  return `vol-${volumeSeq}`
}

/** Fila de losa efectiva: -1 (auto) → fila central de la banda. */
export function resolveFloorAt(floorAt: number, floorH: number) {
  if (floorAt < 0) return Math.floor((floorH - 1) / 2)
  return Math.min(floorH - 1, Math.max(0, Math.round(floorAt)))
}

export function defaultFacadeFace(wall: string, glass: string): FacadeFace {
  return { pattern: 'punched_grid', windowW: 2, gapX: 2, margin: 1, sill: 1, floorAt: -1, wall, glass, custom: null }
}

export function defaultBuilding(): Building {
  const wall = 'minecraft:white_concrete'
  const glass = 'minecraft:light_blue_stained_glass'
  return {
    volumes: [{ id: 'vol-1', name: 'Torre', x: 0, z: 0, w: 6, d: 6, yShare: 0, hShare: 1, grounded: true, gableDir: 'x' }],
    floors: { count: 8, floorHeight: 3, slab: true, slabBlock: 'minecraft:stone_slab', inset: true },
    facade: {
      front: defaultFacadeFace(wall, glass),
      back: defaultFacadeFace(wall, glass),
      left: defaultFacadeFace(wall, glass),
      right: defaultFacadeFace(wall, glass),
    },
    base: { height: 3, style: 'retail_glass', wall, glass, entranceFace: 'front', entranceW: 3 },
    roof: { style: 'open_frame', height: 2, trim: wall, slab: 'minecraft:stone_slab' },
    hollowUnion: true,
  }
}

/** Bounding box en bloques ya resueltos (lo calcula el solver). */
export function buildingSize(boxes: Array<{ x1: number; y1: number; z1: number }>): Vec3 {
  let x1 = 0
  let y1 = 0
  let z1 = 0
  for (const b of boxes) {
    x1 = Math.max(x1, b.x1)
    y1 = Math.max(y1, b.y1)
    z1 = Math.max(z1, b.z1)
  }
  return [x1 + 1, y1 + 1, z1 + 1]
}
