import type { BaseSpec, FacadeFace, RoofSpec } from './types'

export type FacadeTemplate = {
  name: string
  builtin: boolean
  face: FacadeFace
}

const WALL_WHITE = 'minecraft:white_concrete'
const GLASS_LIGHT = 'minecraft:light_blue_stained_glass'

export const BUILTIN_FACADE_TEMPLATES: FacadeTemplate[] = [
  {
    name: 'Torre blanca (referencia)',
    builtin: true,
    face: { pattern: 'punched_grid', windowW: 2, gapX: 2, margin: 1, sill: 1, floorAt: -1, wall: WALL_WHITE, glass: GLASS_LIGHT, custom: null },
  },
  {
    name: 'Oficinas ribbon',
    builtin: true,
    face: { pattern: 'ribbon', windowW: 99, gapX: 0, margin: 1, sill: 1, floorAt: -1, wall: 'minecraft:gray_concrete', glass: 'minecraft:glass', custom: null },
  },
  {
    name: 'Ladrillo clásico',
    builtin: true,
    face: { pattern: 'punched_grid', windowW: 1, gapX: 2, margin: 2, sill: 1, floorAt: -1, wall: 'minecraft:bricks', glass: 'minecraft:white_stained_glass', custom: null },
  },
  {
    name: 'Muro ciego',
    builtin: true,
    face: { pattern: 'solid', windowW: 2, gapX: 2, margin: 1, sill: 1, floorAt: -1, wall: 'minecraft:stone_bricks', glass: GLASS_LIGHT, custom: null },
  },
]

const STORAGE_KEY = 'gennbt-facade-templates'

export function loadUserTemplates(): FacadeTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FacadeTemplate[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t) => t && typeof t.name === 'string' && t.face && typeof t.face === 'object')
  } catch {
    return []
  }
}

export function saveUserTemplate(name: string, face: FacadeFace) {
  const clean = name.trim().slice(0, 40) || 'Mi plantilla'
  const list = loadUserTemplates().filter((t) => t.name !== clean)
  list.push({ name: clean, builtin: false, face: { ...face } })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function deleteUserTemplate(name: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loadUserTemplates().filter((t) => t.name !== name)))
}

export type BaseCombo = { name: string; spec: Pick<BaseSpec, 'style' | 'wall' | 'glass'> }

export const BASE_COMBOS: BaseCombo[] = [
  { name: 'Vidriera blanca', spec: { style: 'retail_glass', wall: 'minecraft:white_concrete', glass: 'minecraft:light_blue_stained_glass' } },
  { name: 'Entrada ladrillo', spec: { style: 'entrance', wall: 'minecraft:bricks', glass: 'minecraft:white_stained_glass' } },
  { name: 'Zócalo piedra', spec: { style: 'solid', wall: 'minecraft:stone_bricks', glass: 'minecraft:glass' } },
  { name: 'Pilotis hormigón', spec: { style: 'pilotis', wall: 'minecraft:gray_concrete', glass: 'minecraft:glass' } },
  { name: 'Cabaña madera', spec: { style: 'entrance', wall: 'minecraft:oak_planks', glass: 'minecraft:glass' } },
  { name: 'Cuarzo monumental', spec: { style: 'retail_glass', wall: 'minecraft:quartz_block', glass: 'minecraft:glass' } },
]

export type RoofCombo = { name: string; spec: Pick<RoofSpec, 'style' | 'trim' | 'slab'> }

export const ROOF_COMBOS: RoofCombo[] = [
  { name: 'Azotea piedra', spec: { style: 'flat_slab', trim: 'minecraft:stone_bricks', slab: 'minecraft:stone_slab' } },
  { name: 'Corona blanca', spec: { style: 'open_frame', trim: 'minecraft:white_concrete', slab: 'minecraft:stone_slab' } },
  { name: 'Tejado ladrillo', spec: { style: 'gable', trim: 'minecraft:bricks', slab: 'minecraft:brick_slab' } },
  { name: 'Tejado madera', spec: { style: 'gable', trim: 'minecraft:oak_planks', slab: 'minecraft:oak_slab' } },
  { name: 'Borde cuarzo', spec: { style: 'flat_slab', trim: 'minecraft:quartz_block', slab: 'minecraft:quartz_slab' } },
  { name: 'Mirador gris', spec: { style: 'open_frame', trim: 'minecraft:gray_concrete', slab: 'minecraft:stone_slab' } },
]

// Bloques comunes para los datalist (el campo acepta cualquier ID vanilla).
export const COMMON_BLOCKS = [
  'minecraft:white_concrete',
  'minecraft:light_gray_concrete',
  'minecraft:gray_concrete',
  'minecraft:black_concrete',
  'minecraft:quartz_block',
  'minecraft:quartz_slab',
  'minecraft:stone',
  'minecraft:stone_bricks',
  'minecraft:stone_slab',
  'minecraft:cobblestone',
  'minecraft:bricks',
  'minecraft:glass',
  'minecraft:white_stained_glass',
  'minecraft:light_blue_stained_glass',
  'minecraft:tinted_glass',
  'minecraft:oak_planks',
  'minecraft:oak_log',
  'minecraft:oak_stairs',
  'minecraft:oak_slab',
  'minecraft:grass_block',
  'minecraft:sea_lantern',
  'minecraft:glowstone',
]
