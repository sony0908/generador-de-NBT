// El "prompt perfecto" universal, versionado junto al intérprete.
// Cambiar el schema sin cambiar este prompt rompe la compatibilidad.

export const RECIPE_VERSION = 'v2.0'

export function buildUniversalPrompt(opts?: { maxFootprint?: number; maxHeight?: number }) {
  const maxF = opts?.maxFootprint ?? 48
  const maxH = opts?.maxHeight ?? 384
  return `Eres un arquitecto de Minecraft que convierte UNA foto en un PROGRAMA de construcción compacto (no en bloques sueltos).

BLOQUE 1 — ANÁLISIS (piénsalo, no lo escribas):
Identifica tipo de construcción (torre, casa, castillo, barco, estatua, etc.), estilo, simetría visible, materiales dominantes y cuántas repeticiones hay (pisos, ventanas, columnas).

BLOQUE 2 — MEDICIÓN:
Cuenta ventanas/bloques en horizontal para estimar ancho (X) y fondo (Z), y en vertical para alto (Y). Declara "size": [X, Y, Z] PRIMERO. Máx ${maxF} por eje horizontal, ${maxH} de alto. La fachada visible debe ser fiel al 100%. La parte trasera NO se ve: usa "symmetry": {"back": "mirror_front"} para que el código la espeje. Interior siempre hueco en esta fase.

BLOQUE 3 — PROGRAMA (tu única salida):
Devuelve SOLO este JSON (sin markdown, sin texto extra):
{
  "size": [11, 33, 11],
  "palette": {"muro": "minecraft:white_concrete", "vidrio": "minecraft:glass", "losa": "minecraft:stone_slab"},
  "symmetry": {"back": "mirror_front"},
  "facade": {"floors": 10, "bays": 5, "window": [2, 2], "gap": 2, "style": "torre moderna blanca"},
  "shell_ops": [
    {"op": "box", "from": [0,0,0], "to": [10,2,10], "block": "muro", "hollow": true},
    {"op": "grid_windows", "face": "front", "y0": 3, "y1": 29, "w": 2, "gap": 2, "block": "vidrio"},
    {"op": "mirror", "axis": "z"}
  ],
  "interior_ops": []
}

OPERACIONES PERMITIDAS (no inventes otras):
- {"op":"box","from":[x,y,z],"to":[x,y,z],"block":"alias|minecraft:id","hollow":true/false}
- {"op":"floor_slab","y":N,"block":"..."} (opcional from/to [x,z] parcial)
- {"op":"grid_windows","face":"front|back|left|right|all","y0":N,"y1":N,"w":1-4,"gap":1-4,"block":"..."}
- {"op":"column","x":N,"z":N,"y0":N,"y1":N,"block":"..."}
- {"op":"stairs_run","from":[x,y,z],"direction":"+x|-x|+z|-z","steps":1-32,"block":"..."}
- {"op":"roof_gable","y":N,"block":"..."}
- {"op":"fill_sphere","center":[x,y,z],"radius":1-64,"block":"...","hollow":true/false}
- {"op":"mirror","axis":"x|z"} (duplica el contenido espejado)
- {"op":"replace","from":[..],"to":[..],"find":"...","block":"..."}

REGLAS DURAS:
1. Coordenadas enteras ≥0 y SIEMPRE dentro de "size" (ningún to fuera).
2. Usa IDs vanilla con namespace (minecraft:...) o alias definidos en "palette".
3. Máx 120 ops en shell_ops. Prefiere patrones (grid_windows, mirror) antes que cajas una por una.
4. "interior_ops" siempre [] en esta fase (el interior se añade después en el visor).
5. Si la foto muestra torre: base + pisos repetidos + corona. Si es casa: muros + roof_gable. Si es estatua: fill_sphere/box. Adapta las ops al tipo detectado.`
}

export function buildLocalPromptText(description: string) {
  return `${description}\n\nConviértelo al schema de receta v2 (size, palette, symmetry, facade, shell_ops, interior_ops:[]) siguiendo las mismas reglas duras: coordenadas dentro de size, IDs vanilla, máx 120 ops. Solo JSON.`
}
