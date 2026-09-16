# Generador de edificios (repo de pruebas)

Configurador paramétrico escalable: **volumetría → pisos → fachada → base → NBT de Minecraft**.
Sin IA obligatoria, sin sorpresas: todo cambio recompila en vivo.

## Flujo (wizard en 4 pasos)

1. **Volumetría**: uno o más cubos (lista + campos numéricos + vista cenital 2D
   arrastrable). Clic para seleccionar, arrastra para mover.
2. **Pisos**: cantidad, espacio entre pisos (2–5), losa sí/no + material.
   Si los pisos no caben en un volumen se construyen los que quepan y se avisa.
3. **Fachada**: plantilla por cara (cuadrícula / tira ribbon / muro ciego),
   ancho y espacio de ventanas, antepecho, muro y vidrio. Botón **Copiar a todas**.
   Sección **Mis plantillas**: guarda tus diseños en el navegador y aplícalos
   a una cara o a todas. Las caras tapadas por otro volumen quedan sin ventanas.
4. **Base y techo**: altura + plantilla de base (vidriera, entrada marcada,
   pilotis, maciza) con puerta configurable; techo (losa+parapeto, marco abierto,
   dos aguas).

## Motor

- `src/parametric/compiler.ts` traduce el diseño a operaciones del intérprete
  (`box`, `floor_slab`, `grid_windows`, `column`, `roof_gable`).
- Vista en vivo en cada cambio + visor 3D (sube tu `client.jar` para texturas).
- Exporta uno o varios `.nbt` (auto-split si un eje >48) + `colocacion.txt`.

## Límites reales

- Altura de mundo `-64…384`. Sin coordenadas negativas en volúmenes.
- Ejes >48 permitidos, pero se dividen en partes de Structure Block.
- Máx 120 operaciones por diseño.

## Dev

```bash
npm install
npm run dev
npm run build
```
