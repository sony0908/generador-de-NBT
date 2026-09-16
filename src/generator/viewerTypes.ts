// Tipos mínimos del visor, clonados de Builder Tables (sin pricing ni policies).
export type ViewerPaletteEntry = {
  name: string
  color: string
  properties: Record<string, string>
}

export type ViewerModel = {
  key: string
  size: [number, number, number]
  positions: Int32Array
  states: Uint32Array
  palette: ViewerPaletteEntry[]
}
