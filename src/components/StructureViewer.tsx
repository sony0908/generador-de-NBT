import { useEffect, useRef } from 'react'
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RotateCcw } from 'lucide-react'
import type { ViewerModel } from '../generator/viewerTypes'
import './StructureViewer.css'

type StructureViewerProps = {
  model: ViewerModel
  theme: 'light' | 'dark'
}

type ViewerController = {
  reset: () => void
}

function hasWebGl() {
  const canvas = document.createElement('canvas')
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
}

export function StructureViewer({ model, theme }: StructureViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<ViewerController | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !model.states.length) return
    if (!hasWebGl()) {
      host.textContent =
        'Este navegador no dispone de WebGL. El análisis y la generación siguen disponibles.'
      host.dataset.error = 'true'
      return
    }

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      host.textContent =
        'No se pudo iniciar WebGL. El análisis y la generación siguen disponibles.'
      host.dataset.error = 'true'
      return
    }

    host.dataset.error = ''
    host.dataset.loading = 'true'
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.background = new Color(theme === 'dark' ? '#101d2e' : '#edf3fa')
    const [width, height, depth] = model.size
    const center = new Vector3(
      (width - 1) / 2,
      (height - 1) / 2,
      (depth - 1) / 2,
    )
    const radius = Math.max(width, height, depth, 1)
    const camera = new PerspectiveCamera(38, 1, 0.1, radius * 30 + 100)
    camera.position.set(
      center.x + radius * 1.45,
      center.y + radius * 1.12,
      center.z + radius * 1.45,
    )

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping = false
    controls.minDistance = Math.max(2, radius * 0.42)
    controls.maxDistance = radius * 12 + 50
    controls.update()
    controls.saveState()

    scene.add(new AmbientLight('#ffffff', 1.75))
    const keyLight = new DirectionalLight('#ffffff', 2.3)
    keyLight.position.set(center.x + radius, center.y + radius * 2, center.z + radius)
    scene.add(keyLight)
    const fillLight = new DirectionalLight('#9cc4ff', 0.9)
    fillLight.position.set(center.x - radius, center.y + radius, center.z - radius)
    scene.add(fillLight)

    const gridSize = Math.max(width, depth, 4) * 1.24
    const grid = new GridHelper(
      gridSize,
      Math.max(Math.round(gridSize), 4),
      theme === 'dark' ? '#406080' : '#b3c2d5',
      theme === 'dark' ? '#243c58' : '#d5dfea',
    )
    grid.position.set(center.x, -0.52, center.z)
    scene.add(grid)

    const geometry = new BoxGeometry(0.96, 0.96, 0.96)
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.03,
    })
    const mesh = new InstancedMesh(geometry, material, model.states.length)
    mesh.count = 0
    scene.add(mesh)

    renderer.outputColorSpace = SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))

    const render = () => {
      renderer.render(scene, camera)
    }

    const resize = () => {
      const bounds = host.getBoundingClientRect()
      const nextWidth = Math.max(Math.round(bounds.width), 1)
      const nextHeight = Math.max(Math.round(bounds.height), 1)
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
      renderer.setSize(nextWidth, nextHeight, false)
      render()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    controls.addEventListener('change', render)
    resize()

    controllerRef.current = {
      reset: () => {
        controls.reset()
        render()
      },
    }

    const matrix = new Matrix4()
    const color = new Color()
    let cursor = 0
    let frameId = 0
    let disposed = false

    const fillChunk = () => {
      if (disposed) return

      const end = Math.min(cursor + 1024, model.states.length)
      for (let index = cursor; index < end; index += 1) {
        const point = index * 3
        const state = model.states[index]
        const palette = model.palette[state]
        matrix.makeTranslation(
          model.positions[point],
          model.positions[point + 1],
          model.positions[point + 2],
        )
        mesh.setMatrixAt(index, matrix)
        color.set(palette?.color ?? '#9da8b8')
        mesh.setColorAt(index, color)
      }

      mesh.count = end
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      render()
      cursor = end

      if (cursor < model.states.length) {
        frameId = window.requestAnimationFrame(fillChunk)
      } else {
        mesh.computeBoundingSphere()
        host.dataset.loading = ''
      }
    }

    frameId = window.requestAnimationFrame(fillChunk)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      observer.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      if (controllerRef.current) controllerRef.current = null
      scene.remove(mesh, grid, keyLight, fillLight)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [model, theme])

  if (model.positions.length !== model.states.length * 3) {
    return (
      <div className="structure-viewer-empty">
        El modelo 3D no contiene posiciones válidas.
      </div>
    )
  }

  if (!model.states.length) {
    return (
      <div className="structure-viewer-empty">
        Esta estructura no contiene bloques visibles después de aplicar la
        compatibilidad.
      </div>
    )
  }

  return (
    <div className="structure-viewer">
      <div
        ref={hostRef}
        className="structure-viewer-canvas"
        aria-label="Visor 3D de la estructura"
      />
      <div className="viewer-guidance">
        Arrastra para rotar · Rueda para zoom · Clic derecho para mover
      </div>
      <button
        className="viewer-reset"
        type="button"
        onClick={() => controllerRef.current?.reset()}
      >
        <RotateCcw size={15} />
        Restablecer vista
      </button>
    </div>
  )
}
