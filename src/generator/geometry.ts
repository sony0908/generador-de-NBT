export const MAX_FILL_VOLUME = 32768

export type StructureSize = [number, number, number]

export type StructureRegion = {
  offset: StructureSize
  size: StructureSize
}

export type Rotation = 0 | 1 | 2 | 3

export type FillBounds = {
  from: StructureSize
  to: StructureSize
}

function volume(size: StructureSize) {
  return size[0] * size[1] * size[2]
}

function largestAxis(size: StructureSize) {
  let axis = 0

  for (let index = 1; index < size.length; index += 1) {
    if (size[index] > size[axis]) axis = index
  }

  return axis
}

function partShape(size: StructureSize) {
  const shape = [...size] as StructureSize

  while (volume(shape) > MAX_FILL_VOLUME) {
    const axis = largestAxis(shape)
    shape[axis] = Math.ceil(shape[axis] / 2)
  }

  return shape
}

export function splitStructureRegions(size: StructureSize): StructureRegion[] {
  const shape = partShape(size)
  const regions: StructureRegion[] = []

  for (let y = 0; y < size[1]; y += shape[1]) {
    for (let z = 0; z < size[2]; z += shape[2]) {
      for (let x = 0; x < size[0]; x += shape[0]) {
        const regionSize: StructureSize = [
          Math.min(shape[0], size[0] - x),
          Math.min(shape[1], size[1] - y),
          Math.min(shape[2], size[2] - z),
        ]

        regions.push({ offset: [x, y, z], size: regionSize })
      }
    }
  }

  return regions
}

export function regionVolume(region: StructureRegion) {
  return volume(region.size)
}

export function rotatedFillBounds(
  region: StructureRegion,
  rotation: Rotation,
): FillBounds {
  const [x, y, z] = region.offset
  const [width, height, depth] = region.size
  const endX = x + width - 1
  const endY = y + height - 1
  const endZ = z + depth - 1

  if (rotation === 0) {
    return { from: [x, y, z], to: [endX, endY, endZ] }
  }

  if (rotation === 1) {
    return { from: [-endZ, y, x], to: [-z, endY, endX] }
  }

  if (rotation === 2) {
    return { from: [-endX, y, -endZ], to: [-x, endY, -z] }
  }

  return { from: [z, y, -endX], to: [endZ, endY, -x] }
}