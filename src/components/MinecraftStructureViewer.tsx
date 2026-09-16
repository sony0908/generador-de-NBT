import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Maximize2, RotateCcw } from 'lucide-react'
import type { ViewerModel } from '../generator/viewerTypes'
import {
  getMinecraftRenderer,
  getPreparedAssets,
  type MinecraftSceneBlock,
  type MinecraftSceneHandle,
} from './minecraft-renderer'
import './MinecraftStructureViewer.css'

type StructureViewerProps = {
  model: ViewerModel
  theme: 'light' | 'dark'
  assetFile: File | null
}

type ViewPreset = 'isometric' | 'top' | 'front' | 'back' | 'right' | 'left'

type ViewerController = {
  reset: () => void
  setView: (view: ViewPreset) => void
  toggleFullscreen: () => void
}

type RenderMode = 'simple' | 'loading' | 'textured' | 'fallback'

function hasWebGl() {
  const canvas = document.createElement('canvas')
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
}
function modelBounds(model: ViewerModel) {
  const bounds = new Box3().makeEmpty()
  const point = new Vector3()

  for (let index = 0; index < model.states.length; index += 1) {
    const offset = index * 3
    point.set(
      model.positions[offset],
      model.positions[offset + 1],
      model.positions[offset + 2],
    )
    bounds.expandByPoint(point)
  }

  if (bounds.isEmpty()) {
    bounds.set(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5))
    return bounds
  }

  bounds.min.addScalar(-0.5)
  bounds.max.addScalar(0.5)
  return bounds
}

function viewDirection(view: ViewPreset) {
  if (view === 'top') return new Vector3(0, 1, 0.001)
  if (view === 'front') return new Vector3(0, 0.28, 1)
  if (view === 'back') return new Vector3(0, 0.28, -1)
  if (view === 'right') return new Vector3(1, 0.28, 0)
  if (view === 'left') return new Vector3(-1, 0.28, 0)
  return new Vector3(1, 0.78, 1)
}

function formatProgress(stage: string, done: number, total: number) {
  const label =
    stage === 'parse'
      ? 'Leyendo modelos'
      : stage === 'light'
        ? 'Calculando luz'
        : stage === 'build'
          ? 'Construyendo geometría'
          : 'Optimizando escena'
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  return label + '… ' + percent + '%'
}

export function MinecraftStructureViewer({
  model,
  theme,
  assetFile,
}: StructureViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<ViewerController | null>(null)
  const [renderMode, setRenderMode] = useState<RenderMode>('simple')
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current)
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !model.states.length) return

    const setLoading = (label?: string) => {
      if (!label) {
        delete host.dataset.loading
        delete host.dataset.loadingLabel
        return
      }
      host.dataset.loading = 'true'
      host.dataset.loadingLabel = label
    }

    if (!hasWebGl()) {
      host.textContent =
        'Este navegador no dispone de WebGL. El análisis y la generación siguen disponibles.'
      host.dataset.error = 'true'
      return
    }

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      host.textContent =
        'No se pudo iniciar WebGL. El análisis y la generación siguen disponibles.'
      host.dataset.error = 'true'
      return
    }

    let disposed = false
    let renderFrame = 0
    let fillFrame = 0
    let needsTransparentSort = false
    let detailedHandle: MinecraftSceneHandle | null = null

    host.dataset.error = ''
    host.dataset.detailError = ''
    host.replaceChildren(renderer.domElement)
    setLoading(assetFile ? 'Preparando recursos visuales…' : 'Preparando bloques…')

    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = theme === 'dark' ? 1.02 : 1.1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))

    const scene = new Scene()
    scene.background = new Color(theme === 'dark' ? '#101a29' : '#edf3fa')

    const fallbackBounds = modelBounds(model)
    const activeBounds = fallbackBounds.clone()
    const center = fallbackBounds.getCenter(new Vector3())
    const span = fallbackBounds.getSize(new Vector3())
    const radius = Math.max(span.x, span.y, span.z, 1)
    const camera = new PerspectiveCamera(38, 1, 0.02, radius * 40 + 400)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.zoomToCursor = true
    controls.screenSpacePanning = false
    controls.minDistance = Math.max(1.2, radius * 0.18)
    controls.maxDistance = radius * 26 + 320

    const hemisphere = new HemisphereLight(
      theme === 'dark' ? '#b6d6ff' : '#d9ebff',
      theme === 'dark' ? '#152337' : '#728199',
      1.35,
    )
    scene.add(hemisphere)

    const keyLight = new DirectionalLight('#fff4dc', 2.2)
    keyLight.position.set(center.x + radius * 1.1, center.y + radius * 2.3, center.z + radius)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    scene.add(keyLight)

    const rimLight = new DirectionalLight('#80adff', 0.85)
    rimLight.position.set(center.x - radius, center.y + radius * 1.2, center.z - radius * 1.35)
    scene.add(rimLight)

    const gridSize = Math.max(span.x, span.z, 4) * 1.2
    const grid = new GridHelper(
      gridSize,
      Math.min(128, Math.max(Math.round(gridSize), 4)),
      theme === 'dark' ? '#4d78a7' : '#aac1db',
      theme === 'dark' ? '#263b57' : '#d2dee9',
    )
    grid.position.set(center.x, fallbackBounds.min.y - 0.51, center.z)
    scene.add(grid)

    const geometry = new BoxGeometry(0.96, 0.96, 0.96)
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.03,
    })
    const fallbackMesh = new InstancedMesh(geometry, material, model.states.length)
    fallbackMesh.count = 0
    fallbackMesh.castShadow = true
    fallbackMesh.receiveShadow = true
    scene.add(fallbackMesh)

    const focusCamera = (view: ViewPreset, saveState = false) => {
      const boundsCenter = activeBounds.getCenter(new Vector3())
      const boundsSize = activeBounds.getSize(new Vector3())
      const verticalFov = MathUtils.degToRad(camera.fov)
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
      const heightDistance = boundsSize.y / (2 * Math.tan(verticalFov / 2))
      const widthDistance = Math.max(boundsSize.x, boundsSize.z) /
        (2 * Math.tan(horizontalFov / 2))
      const largest = Math.max(boundsSize.x, boundsSize.y, boundsSize.z, 1)
      const distance = Math.max(heightDistance, widthDistance, largest * 1.2) * 1.48

      camera.position
        .copy(boundsCenter)
        .add(viewDirection(view).normalize().multiplyScalar(distance))
      camera.near = Math.max(0.02, distance / 1000)
      camera.far = Math.max(400, distance + largest * 36)
      camera.updateProjectionMatrix()
      controls.target.copy(boundsCenter)
      controls.minDistance = Math.max(1.1, largest * 0.16)
      controls.maxDistance = largest * 28 + 400
      controls.update()
      if (saveState) controls.saveState()
    }

    const render = () => {
      renderFrame = 0
      if (disposed) return
      const changing = controls.update()
      if (needsTransparentSort && detailedHandle) {
        detailedHandle.sortTranslucent(camera)
        needsTransparentSort = false
      }
      renderer.render(scene, camera)
      if (changing) requestRender()
    }

    const requestRender = () => {
      if (!renderFrame && !disposed) {
        renderFrame = window.requestAnimationFrame(render)
      }
    }

    const resize = () => {
      const bounds = host.getBoundingClientRect()
      const width = Math.max(Math.round(bounds.width), 1)
      const height = Math.max(Math.round(bounds.height), 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      needsTransparentSort = true
      requestRender()
    }

    const onControlsChange = () => {
      needsTransparentSort = true
      requestRender()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    controls.addEventListener('change', onControlsChange)
    focusCamera('isometric', true)
    resize()

    controllerRef.current = {
      reset: () => {
        controls.reset()
        needsTransparentSort = true
        requestRender()
      },
      setView: (view) => {
        focusCamera(view)
        needsTransparentSort = true
        requestRender()
      },
      toggleFullscreen: () => {
        const root = rootRef.current
        if (!root) return
        if (document.fullscreenElement === root) {
          void document.exitFullscreen()
          return
        }
        void root.requestFullscreen().catch(() => undefined)
      },
    }

    const matrix = new Matrix4()
    const color = new Color()
    let cursor = 0

    const fillChunk = () => {
      if (disposed) return

      const end = Math.min(cursor + 1400, model.states.length)
      for (let index = cursor; index < end; index += 1) {
        const point = index * 3
        const palette = model.palette[model.states[index]]
        matrix.makeTranslation(
          model.positions[point],
          model.positions[point + 1],
          model.positions[point + 2],
        )
        fallbackMesh.setMatrixAt(index, matrix)
        color.set(palette?.color ?? '#9da8b8')
        fallbackMesh.setColorAt(index, color)
      }

      fallbackMesh.count = end
      fallbackMesh.instanceMatrix.needsUpdate = true
      if (fallbackMesh.instanceColor) fallbackMesh.instanceColor.needsUpdate = true
      requestRender()
      cursor = end

      if (cursor < model.states.length) {
        fillFrame = window.requestAnimationFrame(fillChunk)
      } else if (!assetFile) {
        setLoading()
      }
    }

    fillFrame = window.requestAnimationFrame(fillChunk)

    if (assetFile) {
      void (async () => {
        try {
          const minecraftRenderer = await getMinecraftRenderer()
          const assets = await getPreparedAssets(minecraftRenderer, assetFile)
          if (disposed) return

          const blocks: MinecraftSceneBlock[] = []
          for (let index = 0; index < model.states.length; index += 1) {
            const palette = model.palette[model.states[index]]
            if (!palette) continue
            const point = index * 3
            blocks.push({
              id: palette.name,
              properties: palette.properties,
              pos: [
                model.positions[point],
                model.positions[point + 1],
                model.positions[point + 2],
              ],
            })
          }

          const handle = await minecraftRenderer.createScene(assets, blocks, {
            lighting: 'world',
            version: '26.2',
            defaults: 'game',
            optimize: true,
            shouldCancel: () => disposed,
            onProgress: (stage, done, total) => {
              if (!disposed) setLoading(formatProgress(stage.name, done, total))
            },
          })

          if (!handle || disposed) {
            handle?.dispose()
            return
          }

          detailedHandle = handle
          handle.group.scale.setScalar(1 / 16)
          handle.group.updateMatrixWorld(true)
          scene.add(handle.group)
          fallbackMesh.visible = false
          activeBounds.copy(new Box3().setFromObject(handle.group))
          focusCamera('isometric', true)
          needsTransparentSort = true
          setLoading()
          setRenderMode('textured')
          requestRender()
        } catch {
          if (disposed) return
          host.dataset.detailError = 'true'
          setLoading()
          setRenderMode('fallback')
          requestRender()
        }
      })()
    }

    return () => {
      disposed = true
      window.cancelAnimationFrame(renderFrame)
      window.cancelAnimationFrame(fillFrame)
      observer.disconnect()
      controls.removeEventListener('change', onControlsChange)
      controls.dispose()
      if (controllerRef.current) controllerRef.current = null
      detailedHandle?.dispose()
      scene.remove(fallbackMesh, grid, hemisphere, keyLight, rimLight)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [assetFile, model, theme])

  if (model.positions.length !== model.states.length * 3) {
    return (
      <div className="minecraft-viewer-empty">
        El modelo 3D no contiene posiciones válidas.
      </div>
    )
  }

  if (!model.states.length) {
    return (
      <div className="minecraft-viewer-empty">
        Esta estructura no contiene bloques visibles después de aplicar la compatibilidad.
      </div>
    )
  }

  const statusCopy =
    renderMode === 'textured'
      ? 'Modelos y texturas del archivo local'
      : renderMode === 'loading'
        ? 'Cargando modelos y texturas…'
        : renderMode === 'fallback'
          ? 'Vista simplificada: no se pudieron usar esos recursos'
          : 'Vista simplificada por materiales'

  return (
    <div
      ref={rootRef}
      className={'minecraft-structure-viewer' + (isFullscreen ? ' is-fullscreen' : '')}
    >
      <div
        ref={hostRef}
        className="minecraft-viewer-canvas"
        aria-label="Visor 3D de la estructura"
      />
      <div className="minecraft-viewer-toolbar" aria-label="Controles del visor">
        <div className="minecraft-viewer-toolbar-group">
          <button type="button" onClick={() => controllerRef.current?.setView('isometric')}>
            3D
          </button>
          <button type="button" onClick={() => controllerRef.current?.setView('top')}>
            Superior
          </button>
          <button type="button" onClick={() => controllerRef.current?.setView('front')}>
            Frontal
          </button>
          <button type="button" onClick={() => controllerRef.current?.setView('back')}>
            Trasera
          </button>
          <button type="button" onClick={() => controllerRef.current?.setView('right')}>
            Lateral der.
          </button>
          <button type="button" onClick={() => controllerRef.current?.setView('left')}>
            Lateral izq.
          </button>
        </div>
        <div className="minecraft-viewer-toolbar-group minecraft-viewer-toolbar-actions">
          <button type="button" onClick={() => controllerRef.current?.reset()} title="Restablecer vista">
            <RotateCcw size={15} />
            Restablecer
          </button>
          <button
            type="button"
            onClick={() => controllerRef.current?.toggleFullscreen()}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
          >
            <Maximize2 size={15} />
            {isFullscreen ? 'Salir' : 'Pantalla completa'}
          </button>
        </div>
      </div>
      <div className="minecraft-viewer-guidance">
        Arrastra para rotar · Rueda para zoom · Clic derecho para mover
      </div>
      <div
        className={'minecraft-viewer-status minecraft-viewer-status-' + renderMode}
        role="status"
      >
        {statusCopy}
      </div>
    </div>
  )
}
