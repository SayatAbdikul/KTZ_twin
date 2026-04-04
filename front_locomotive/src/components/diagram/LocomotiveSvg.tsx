import { useEffect, useRef, useState } from 'react'
import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhongMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DIAGRAM_ZONES } from '@/config/diagram.config'
import { useHealthStore } from '@/features/health/useHealthStore'
import type { MousePosition } from '@/types/diagram'
import type { SubsystemStatus } from '@/types/health'

interface LocomotiveSvgProps {
  selectedZoneId: string | null
  hoveredZoneId: string | null
  onZoneHover: (zoneId: string | null, position?: MousePosition) => void
  onZoneClick: (zoneId: string) => void
  onMouseLeave: () => void
}

type ZoneStatus = SubsystemStatus | 'none'
type SceneLoadState = 'loading' | 'ready' | 'error'

interface ZoneVisual {
  fills: Mesh[]
  outlines: LineSegments[]
}

interface ZoneVolume {
  size: [number, number, number]
  position: [number, number, number]
}

interface ZoneLayoutConfig {
  volumes: ZoneVolume[]
}

const MODEL_URL = '/models/teplovoz-m62/scene.gltf'

const STATUS_STYLES: Record<ZoneStatus, { color: string; hex: number }> = {
  normal: { color: '#34d399', hex: 0x34d399 },
  degraded: { color: '#f59e0b', hex: 0xf59e0b },
  warning: { color: '#fb923c', hex: 0xfb923c },
  critical: { color: '#f87171', hex: 0xf87171 },
  unknown: { color: '#64748b', hex: 0x64748b },
  none: { color: '#60a5fa', hex: 0x60a5fa },
}

const FAULT_STATUSES: ZoneStatus[] = ['degraded', 'warning', 'critical']

const ZONE_LAYOUTS: Record<string, ZoneLayoutConfig> = {
  cab: {
    volumes: [{ size: [2.35, 2.9, 2.5], position: [-5.18, 2.3, 0] }],
  },
  electrical: {
    volumes: [{ size: [2.35, 1.95, 2.55], position: [-2.45, 2.02, 0] }],
  },
  pneumatics: {
    volumes: [{ size: [1.65, 1.15, 2.4], position: [-0.65, 1.78, 0] }],
  },
  engine: {
    volumes: [{ size: [3.15, 2.25, 2.62], position: [1.55, 2.14, 0] }],
  },
  cooling: {
    volumes: [{ size: [2.85, 2.75, 2.62], position: [4.6, 2.55, 0] }],
  },
  fuel: {
    volumes: [{ size: [6.85, 0.78, 1.3], position: [0.55, 0.88, 0] }],
  },
  brakes: {
    volumes: [{ size: [12.7, 0.34, 2.42], position: [0.5, 1.14, 0] }],
  },
  traction: {
    volumes: [
      { size: [2.75, 0.95, 2.75], position: [-3.65, 0.82, 0] },
      { size: [2.75, 0.95, 2.75], position: [4.1, 0.82, 0] },
    ],
  },
}

const MODEL_TARGET_SIZE = new Vector3(15.4, 5.3, 3.8)
const TRACK_BASE_Y = 0.72
const EDGE_MESH_NAMES = new Set([
  'kuzov_0',
  'cabina_0',
  'jaluzi_0',
  'jaluzi_1',
  'bogie_front_0',
  'bogie_front.001_0',
  'scepka_0',
])

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getZoneStatus(
  subsystemId: string | null,
  subsystems: Array<{ subsystemId: string; status: SubsystemStatus }> | undefined
): ZoneStatus {
  if (!subsystemId) return 'none'
  const sub = subsystems?.find((item) => item.subsystemId === subsystemId)
  return sub?.status ?? 'unknown'
}

function createOverlayVolume(color: number) {
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshPhongMaterial({
    color,
    emissive: new Color(color),
    emissiveIntensity: 0.14,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    shininess: 70,
  })
  const mesh = new Mesh(geometry, material)
  const outline = new LineSegments(
    new EdgesGeometry(geometry),
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    })
  )
  mesh.add(outline)
  return { mesh, outline }
}

function createFrameMesh(
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  opacity = 1
) {
  const geometry = new BoxGeometry(...size)
  const material = new MeshPhongMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    shininess: 30,
    specular: new Color(0x94a3b8),
  })
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  const outline = new LineSegments(
    new EdgesGeometry(geometry),
    new LineBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.72,
    })
  )
  mesh.add(outline)
  return { mesh, geometry, material, outline }
}

export function LocomotiveSvg({
  selectedZoneId,
  hoveredZoneId,
  onZoneHover,
  onZoneClick,
  onMouseLeave,
}: LocomotiveSvgProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [loadState, setLoadState] = useState<SceneLoadState>('loading')
  const healthIndex = useHealthStore((state) => state.healthIndex)
  const subsystems = healthIndex?.subsystems

  const callbacksRef = useRef({ onZoneHover, onZoneClick, onMouseLeave })
  const sceneRenderRef = useRef<(() => void) | null>(null)
  const relayoutRef = useRef<(() => void) | null>(null)
  const zoneVisualsRef = useRef<Map<string, ZoneVisual>>(new Map())

  useEffect(() => {
    callbacksRef.current = { onZoneHover, onZoneClick, onMouseLeave }
  }, [onZoneHover, onZoneClick, onMouseLeave])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false

    const scene = new Scene()
    const canvas = document.createElement('canvas')
    const contextAttributes = { alpha: true, antialias: true }
    const gl =
      (canvas.getContext('webgl2', contextAttributes) as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl', contextAttributes) as WebGLRenderingContext | null) ??
      (canvas.getContext('experimental-webgl', contextAttributes) as WebGLRenderingContext | null)

    if (!gl) {
      setLoadState('error')
      return
    }

    const renderer = new WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true })

    renderer.outputColorSpace = SRGBColorSpace
    renderer.setClearAlpha(0)
    renderer.domElement.className = 'h-full w-full'
    host.appendChild(renderer.domElement)

    const camera = new OrthographicCamera(-10, 10, 6, -6, 0.1, 100)
    camera.position.set(-4.2, 10.4, 20.8)
    camera.lookAt(0.15, 1.85, 0)

    scene.add(new AmbientLight(0xf8fafc, 1.65))

    const keyLight = new DirectionalLight(0xffffff, 1.25)
    keyLight.position.set(-12, 18, 10)
    scene.add(keyLight)

    const fillLight = new DirectionalLight(0x93c5fd, 0.95)
    fillLight.position.set(10, 7, -10)
    scene.add(fillLight)

    const rimLight = new DirectionalLight(0x60a5fa, 0.55)
    rimLight.position.set(4, 5, 12)
    scene.add(rimLight)

    const railMaterials = new Set<MeshPhongMaterial | LineBasicMaterial>()
    const railGeometries = new Set<BoxGeometry | EdgesGeometry>()
    const overlayMaterials = new Set<MeshPhongMaterial | LineBasicMaterial>()
    const overlayGeometries = new Set<BoxGeometry | EdgesGeometry>()
    const modelGeometries = new Set<EdgesGeometry>()
    const modelLineMaterials = new Set<LineBasicMaterial>()
    const modelMeshes: Mesh[] = []
    const interactiveMeshes: Mesh[] = []
    const zoneVisuals = new Map<string, ZoneVisual>()

    const stageGroup = new Group()
    const overlayGroup = new Group()
    const modelGroup = new Group()
    scene.add(stageGroup, overlayGroup, modelGroup)

    const addFrameBox = (
      size: [number, number, number],
      position: [number, number, number],
      color: number,
      opacity = 1
    ) => {
      const { mesh, geometry, material, outline } = createFrameMesh(size, position, color, opacity)
      railMaterials.add(material)
      railMaterials.add(outline.material as LineBasicMaterial)
      railGeometries.add(geometry)
      railGeometries.add(outline.geometry as EdgesGeometry)
      stageGroup.add(mesh)
    }

    addFrameBox([14.3, 0.06, 0.12], [0.4, 0.08, 1.05], 0x64748b, 0.95)
    addFrameBox([14.3, 0.06, 0.12], [0.4, 0.08, -1.05], 0x64748b, 0.95)
    addFrameBox([14.6, 0.03, 2.85], [0.4, 0.01, 0], 0x0f172a, 0.72)

    ;[-6.1, -4.9, -3.7, -2.5, -1.3, -0.1, 1.1, 2.3, 3.5, 4.7, 5.9].forEach((x) => {
      addFrameBox([0.24, 0.06, 2.42], [x, 0.05, 0], 0x374151, 0.85)
    })

    Object.entries(ZONE_LAYOUTS).forEach(([zoneId, layout]) => {
      layout.volumes.forEach((volume) => {
        const { mesh, outline } = createOverlayVolume(STATUS_STYLES.none.hex)
        mesh.scale.set(...volume.size)
        mesh.position.set(...volume.position)
        mesh.userData.zoneId = zoneId
        interactiveMeshes.push(mesh)
        overlayMaterials.add(mesh.material as MeshPhongMaterial)
        overlayMaterials.add(outline.material as LineBasicMaterial)
        overlayGeometries.add(mesh.geometry as BoxGeometry)
        overlayGeometries.add(outline.geometry as EdgesGeometry)

        const current = zoneVisuals.get(zoneId)
        if (current) {
          current.fills.push(mesh)
          current.outlines.push(outline)
        } else {
          zoneVisuals.set(zoneId, { fills: [mesh], outlines: [outline] })
        }
        overlayGroup.add(mesh)
      })
    })

    const loader = new GLTFLoader()

    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return

        const assetRoot = new Group()
        assetRoot.rotation.x = -Math.PI / 2
        assetRoot.rotation.y = Math.PI / 2
        assetRoot.add(gltf.scene)
        assetRoot.updateMatrixWorld(true)

        const sourceBox = new Box3().setFromObject(assetRoot)
        const sourceSize = sourceBox.getSize(new Vector3())
        const sourceCenter = sourceBox.getCenter(new Vector3())
        const scale = Math.min(
          MODEL_TARGET_SIZE.x / sourceSize.x,
          MODEL_TARGET_SIZE.y / sourceSize.y,
          MODEL_TARGET_SIZE.z / sourceSize.z
        )

        const centeredMinY = (sourceBox.min.y - sourceCenter.y) * scale
        assetRoot.scale.setScalar(scale)
        assetRoot.position.set(
          -sourceCenter.x * scale + 0.15,
          TRACK_BASE_Y - centeredMinY,
          -sourceCenter.z * scale
        )

        assetRoot.traverse((child) => {
          if (!(child instanceof Mesh)) return

          modelMeshes.push(child)

          if (Array.isArray(child.material)) {
            child.material.forEach((entry) => {
              if (entry instanceof MeshStandardMaterial) {
                entry.roughness = clamp(entry.roughness + 0.08, 0, 1)
                entry.metalness = clamp(entry.metalness * 0.55, 0, 1)
                entry.envMapIntensity = 0.9
              }
            })
          } else if (child.material instanceof MeshStandardMaterial) {
            child.material.roughness = clamp(child.material.roughness + 0.08, 0, 1)
            child.material.metalness = clamp(child.material.metalness * 0.55, 0, 1)
            child.material.envMapIntensity = 0.9
          }

          if (EDGE_MESH_NAMES.has(child.name)) {
            const edge = new LineSegments(
              new EdgesGeometry(child.geometry),
              new LineBasicMaterial({
                color: 0x93c5fd,
                transparent: true,
                opacity: 0.12,
              })
            )
            modelGeometries.add(edge.geometry as EdgesGeometry)
            modelLineMaterials.add(edge.material as LineBasicMaterial)
            child.add(edge)
          }
        })

        modelGroup.add(assetRoot)
        setLoadState('ready')
        relayoutRef.current?.()
        sceneRenderRef.current?.()
      },
      undefined,
      () => {
        if (disposed) return
        setLoadState('error')
      }
    )

    const raycaster = new Raycaster()
    const pointer = new Vector2()

    const renderScene = () => {
      renderer.render(scene, camera)
    }

    const relayout = () => {
      const width = host.clientWidth
      const height = host.clientHeight || 1
      const aspect = width / height
      const frustumHeight = 10.8

      camera.left = (-frustumHeight * aspect) / 2
      camera.right = (frustumHeight * aspect) / 2
      camera.top = frustumHeight / 2
      camera.bottom = -frustumHeight / 2
      camera.updateProjectionMatrix()

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height, false)
      renderScene()
    }

    const findZoneAtPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(interactiveMeshes, false)[0]
      return (hit?.object.userData.zoneId as string | undefined) ?? null
    }

    const handlePointerMove = (event: PointerEvent) => {
      const zoneId = findZoneAtPointer(event)
      renderer.domElement.style.cursor = zoneId ? 'pointer' : 'default'
      callbacksRef.current.onZoneHover(zoneId, zoneId ? { x: event.clientX, y: event.clientY } : undefined)
    }

    const handlePointerLeave = () => {
      renderer.domElement.style.cursor = 'default'
      callbacksRef.current.onMouseLeave()
    }

    const handleClick = (event: PointerEvent) => {
      const zoneId = findZoneAtPointer(event)
      if (zoneId) callbacksRef.current.onZoneClick(zoneId)
    }

    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
    renderer.domElement.addEventListener('click', handleClick)

    const resizeObserver = new ResizeObserver(relayout)
    resizeObserver.observe(host)

    zoneVisualsRef.current = zoneVisuals
    sceneRenderRef.current = renderScene
    relayoutRef.current = relayout
    relayout()

    return () => {
      disposed = true
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      renderer.domElement.removeEventListener('click', handleClick)

      railMaterials.forEach((material) => material.dispose())
      railGeometries.forEach((geometry) => geometry.dispose())
      overlayMaterials.forEach((material) => material.dispose())
      overlayGeometries.forEach((geometry) => geometry.dispose())
      modelGeometries.forEach((geometry) => geometry.dispose())
      modelLineMaterials.forEach((material) => material.dispose())

      modelMeshes.forEach((mesh) => {
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((entry) => entry.dispose())
        } else {
          mesh.material.dispose()
        }
      })

      renderer.dispose()
      zoneVisualsRef.current = new Map()
      sceneRenderRef.current = null
      relayoutRef.current = null

      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const zoneVisuals = zoneVisualsRef.current

    DIAGRAM_ZONES.forEach((zone) => {
      const visual = zoneVisuals.get(zone.zoneId)
      if (!visual) return

      const status = getZoneStatus(zone.subsystemId, subsystems)
      const accent = STATUS_STYLES[status]
      const isHovered = hoveredZoneId === zone.zoneId
      const isSelected = selectedZoneId === zone.zoneId
      const isFaulted = FAULT_STATUSES.includes(status)
      const baseOpacity = isFaulted ? (isSelected ? 0.16 : isHovered ? 0.11 : 0.07) : 0
      const lineOpacity = isFaulted ? (isSelected ? 0.95 : isHovered ? 0.72 : 0.42) : 0

      visual.fills.forEach((mesh) => {
        const material = mesh.material as MeshPhongMaterial
        material.color.setHex(accent.hex)
        material.emissive.setHex(accent.hex)
        material.emissiveIntensity = isFaulted
          ? isSelected
            ? 0.32
            : isHovered
              ? 0.24
              : 0.16
          : 0.08
        material.opacity = baseOpacity
      })

      visual.outlines.forEach((outline) => {
        const material = outline.material as LineBasicMaterial
        material.color.setHex(accent.hex)
        material.opacity = lineOpacity
      })
    })

    sceneRenderRef.current?.()
  }, [hoveredZoneId, selectedZoneId, subsystems])

  return (
    <div
      ref={hostRef}
      className="relative h-[560px] w-full overflow-hidden rounded-[28px] border border-sky-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,8,23,0.98))] shadow-[inset_0_1px_0_rgba(148,163,184,0.10),0_24px_80px_rgba(2,6,23,0.48)]"
      onMouseLeave={onMouseLeave}
      role="img"
      aria-label="Interactive 3D M62 locomotive subsystem blueprint"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.9))',
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-6 py-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-sky-300/75">
            3D system blueprint
          </p>
          <h2 className="mt-2 text-[15px] font-semibold text-slate-100">
            M62 locomotive digital twin
          </h2>
        </div>
        <div className="rounded-full border border-sky-400/20 bg-slate-950/55 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-sky-100/65">
          Three.js
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950 via-slate-950/65 to-transparent" />

      <div className="pointer-events-none absolute left-6 right-6 top-[92px] flex items-center justify-between">
        <div className="h-px flex-1 bg-gradient-to-r from-sky-400/40 to-transparent" />
        <div className="mx-4 font-mono text-[10px] uppercase tracking-[0.28em] text-sky-100/45">
          locomotive interaction
        </div>
        <div className="h-px flex-1 bg-gradient-to-l from-sky-400/40 to-transparent" />
      </div>

      {loadState === 'ready' && (
        <div className="pointer-events-none absolute bottom-5 left-5 rounded-full border border-sky-400/16 bg-slate-950/68 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-sky-100/62 backdrop-blur-sm">
          Hover locomotive zones for details
        </div>
      )}

      {loadState !== 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
          <div className="rounded-full border border-sky-400/20 bg-slate-950/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-sky-100/70">
            {loadState === 'loading' ? 'Loading M62 model' : 'Model load failed'}
          </div>
        </div>
      )}
    </div>
  )
}
