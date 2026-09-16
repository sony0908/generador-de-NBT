import { VANILLA_BLOCK_IDS_26_2 } from '../generator/vanilla-blocks-26_2'

const VANILLA = new Set<string>(VANILLA_BLOCK_IDS_26_2)

// Alias ES -> vanilla + atajos sin namespace.
const ALIASES: Record<string, string> = {
  'minecraft:cuarzo': 'minecraft:quartz_block',
  'minecraft:roble': 'minecraft:oak_planks',
  'minecraft:cristal': 'minecraft:glass',
  'minecraft:vidrio': 'minecraft:glass',
  'minecraft:piedra': 'minecraft:stone',
  'minecraft:madera': 'minecraft:oak_planks',
  'minecraft:ladrillo': 'minecraft:bricks',
  'minecraft:ladrillos': 'minecraft:bricks',
  'minecraft:loseta': 'minecraft:stone_slab',
  'minecraft:losa': 'minecraft:stone_slab',
  'cuarzo': 'minecraft:quartz_block',
  'roble': 'minecraft:oak_planks',
  'cristal': 'minecraft:glass',
  'vidrio': 'minecraft:glass',
  'piedra': 'minecraft:stone',
  'madera': 'minecraft:oak_planks',
}

export function normalizeBlockName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let name = raw.trim().toLowerCase()
  if (!name || name === 'air' || name === 'minecraft:air' || name === '0' || name === 'null' || name === 'vacio' || name === 'vacío' || name === 'none') return null
  if (ALIASES[name]) return ALIASES[name]
  if (!name.includes(':')) name = 'minecraft:' + name
  if (ALIASES[name]) return ALIASES[name]
  return name
}

export function isVanillaBlock(name: string) {
  return VANILLA.has(name)
}

export function blockColor(name: string) {
  if (name.includes('water') || name.includes('ice')) return '#4f9bdd'
  if (name.includes('lava') || name.includes('magma')) return '#e06a39'
  if (name.includes('glass')) return '#79b7c9'
  if (name.includes('leaves') || name.includes('moss')) return '#518a50'
  if (name.includes('grass') || name.includes('fern')) return '#6a9c50'
  if (name.includes('log') || name.includes('wood') || name.includes('planks') || name.includes('fence')) return '#8a6140'
  if (name.includes('sand') || name.includes('end_stone')) return '#c9b578'
  if (name.includes('dirt') || name.includes('terracotta')) return '#a56e55'
  if (name.includes('stone') || name.includes('deepslate') || name.includes('brick') || name.includes('concrete') || name.includes('quartz')) return '#9aa1ad'
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const r = 110 + (hash & 63)
  const g = 110 + ((hash >>> 6) & 63)
  const b = 110 + ((hash >>> 12) & 63)
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}
