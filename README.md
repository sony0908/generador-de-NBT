# Generador de NBT (repo de pruebas)

Herramienta universal: **foto → 3 planos arquitectónicos → fusión 3D → NBT de Minecraft**.

Separado de Builder Tables para probar sin romper el proyecto principal.

## Por qué planos y no bloques directos

Pedirle a la IA todos los bloques de una estructura grande falla (alucina dimensiones y pierde detalle).
En cambio la IA dibuja 3 vistas ortográficas como grillas exactas (**1 celda = 1 bloque**),
el usuario las revisa, y el código las fusiona de forma determinista. La generación de
imágenes por API no tiene capa gratuita, así que los planos son grillas + render blueprint,
no fotos generadas.

## Flujo

1. **Entrada**: foto (Gemini `gemini-3.6-flash`, gratis) o texto (KoboldCpp local).
   La IA devuelve `PlanSet`: `size`, `palette`, `plans {front, side, top}`.
2. **Planos**: cada plano se muestra como blueprint (frontal X×Y, lateral Z×Y, cenital X×Z).
   Por plano: **Aceptar**, **Regenerar** (con nota de corrección) o **Editar celdas** (pincel manual).
   El botón de construir se desbloquea con los 3 aceptados. Trasera = espejo del frontal.
   Si el edificio supera 48 en un eje, la IA dibuja a escala real y tú aplicas
   el escalado determinista (1:1 / 75% / 50%) viendo el tamaño resultante.
3. **Fusión 3D** (sin IA): intersección de extrusiones — un voxel sobrevive solo si
   ningún plano dice `air`; interior hueco; el material lo manda la cara dueña.
   Los conflictos se reportan, no se esconden.
4. **Visor + exportar**: previsualización 3D (sube tu `client.jar` para texturas reales),
   descarga de uno o varios `.nbt` (auto-split si un eje >48) + `colocacion.txt`.

## Límites reales

- Altura de mundo `-64…384`. Nada bajo bedrock.
- Ejes >48 permitidos, pero se dividen en partes de Structure Block.

## Pospuesto (código conservado)

- Interior editable (pisos, escaleras, iluminación, amoblado): `src/voxel/interior.ts`,
  `src/components/InteriorPanel.tsx`, ocultos tras `SHOW_INTERIOR` en `App.tsx`.

## Dev

```bash
npm install
npm run dev
npm run build
```
