# Generador de NBT (repo de pruebas)

Herramienta universal: **imagen o texto → receta visible/editable → estructura NBT de Minecraft**.

Separado de Builder Tables para probar sin romper el proyecto principal. Solo se clonó de allí:
- `src/generator/geometry.ts` (particionado en regiones >48)
- `src/generator/vanilla-blocks-26_2.ts` (allowlist de bloques)
- `src/components/StructureViewer.tsx` + CSS (visor 3D liviano)
- Patrón de escritura NBT con `nbtify`

## Flujo

1. **Entrada**: foto (Gemini `gemini-3.6-flash`, gratis) o texto (KoboldCpp local).
2. **Receta visible**: JSON con `size`, `palette`, `symmetry`, `facade`, `shell_ops`, `interior_ops`. Edítala antes de construir.
3. **Base**: el intérprete ejecuta `shell_ops` → visor 3D. Fachada fiel, trasera espejada, interior hueco.
4. **Interior**: toggles (pisos, escaleras, iluminación, amoblado) + niveles Y → se fusiona sin tocar la fachada.
5. **Export**: uno o varios `.nbt` (auto-split si un eje >48) + `colocacion.txt`.

## Límites reales

- Altura de mundo `-64…320`. Nada bajo bedrock.
- Ejes >48 permitidos, pero se dividen en partes de Structure Block.

## Dev

```bash
npm install
npm run dev
npm run build
```
