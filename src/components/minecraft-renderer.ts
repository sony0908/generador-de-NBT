import type { Box3, Object3D, PerspectiveCamera } from 'three'
import * as Three from 'three'

export type MinecraftSceneBlock = {
  id: string
  properties: Record<string, string>
  pos: [number, number, number]
}

export type MinecraftSceneHandle = {
  group: Object3D
  bounds: Box3
  sortTranslucent: (camera: PerspectiveCamera) => void
  dispose: () => void
}

export type MinecraftRendererModule = {
  configure: (options: {
    THREE: typeof Three
    assetsUrl?: string | false
  }) => void
  prepareAssets: (
    inputs: Array<File | Blob | ArrayBuffer | Uint8Array>,
    options?: { cache?: boolean; version?: string; defaults?: 'game' },
  ) => Promise<unknown>
  createScene: (
    assets: unknown,
    blocks: MinecraftSceneBlock[],
    options: {
      lighting: 'world'
      version: string
      defaults: 'game'
      optimize: boolean
      shouldCancel: () => boolean
      onProgress: (
        stage: { index: number; count: number; name: string },
        done: number,
        total: number,
      ) => void
    },
  ) => Promise<MinecraftSceneHandle | null>
  renderBlock: (options: {
    id: string
    assets: unknown
    width: number
    height: number
    version: string
    defaults: 'game'
    lighting?: 'world'
    background?: string
  }) => Promise<HTMLCanvasElement>
}

const BMR_MODULE_PATH =
  import.meta.env.BASE_URL +
  'vendor/block-model-renderer/block-model-renderer.min.js'
const BMR_ASSETS_PATH =
  import.meta.env.BASE_URL + 'vendor/block-model-renderer/assets.zip'

let minecraftRendererPromise: Promise<MinecraftRendererModule> | null = null
const preparedAssets = new WeakMap<File, Promise<unknown>>()

export function getMinecraftRenderer() {
  if (!minecraftRendererPromise) {
    minecraftRendererPromise = import(
      /* @vite-ignore */ BMR_MODULE_PATH
    ).then((module) => {
      const renderer = module as MinecraftRendererModule
      renderer.configure({
        THREE: Three,
        assetsUrl: BMR_ASSETS_PATH,
      })
      return renderer
    })
  }

  return minecraftRendererPromise
}

export async function getPreparedAssets(
  renderer: MinecraftRendererModule,
  assetFile: File,
) {
  let promise = preparedAssets.get(assetFile)
  if (!promise) {
    promise = renderer.prepareAssets([assetFile], {
      cache: true,
      version: '26.2',
      defaults: 'game',
    })
    preparedAssets.set(assetFile, promise)
  }
  return promise
}
