import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  IonImageryProvider,
  Cartesian3,
  Math as CesiumMath,
  Color,
  Primitive,
  GeometryInstance,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  ComponentDatatype,
  PrimitiveType,
  BoundingSphere,
  EllipsoidSurfaceAppearance,
  Material,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D/Map3D.css'

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

const TOPOLOGY_URL = '/data/ww3/lr_mesh_topology.json'
const FRAMES_URL = '/data/ww3/lr_mesh_frames.json'
const METADATA_URL = '/data/ww3/lr_mesh_metadata.json'

const TARGET_RENDER_INTERVAL_MS = 50
const DEFAULT_TIME_SPEED_H_PER_S = 3
const DEFAULT_WAVE_VISUAL_SPEED = 8
const DEFAULT_WAVE_BOOST = 2.6
const DEFAULT_SEA_LEVEL_BOOST = 1.3
const DEFAULT_TIDE_AMPLITUDE_M = 0.7
const WATER_SURFACE_BASE_M = 2.4

interface Props {
  onBack: () => void
}

interface WaveMeshTopology {
  version: number
  project: string
  crs: string
  units: string
  vertex_count: number
  triangle_count: number
  point_count: number
  bbox: {
    lon_min: number
    lat_min: number
    lon_max: number
    lat_max: number
  }
  center: {
    lon: number
    lat: number
  }
  vertices_lonlat: number[][]
  vertex_local_x_m: number[]
  vertex_local_y_m: number[]
  triangles: number[][]
}

interface WaveMeshFrame {
  t: number
  ts: string
  n_active: number
  hs_max: number
  hs_mean: number
  active_vertex_ids: number[]
  active_triangle_ids: number[]
  vertex_hs: number[]
  vertex_tp: number[]
  vertex_dir_deg: number[]
}

interface WaveMeshFramesFile {
  version: number
  frame_count: number
  frames: WaveMeshFrame[]
}

interface WaveMeshMetadata {
  version: number
  project: string
  date: string
  bbox: {
    lon_min: number
    lat_min: number
    lon_max: number
    lat_max: number
  }
  center: {
    lon: number
    lat: number
  }
  n_points: number
  n_frames: number
  timesteps: string[]
  hs_global_max: number
  resolution_m: number
  crs: string
  triangle_count: number
  vertex_count: number
}

interface FramePair {
  indexA: number
  indexB: number
  frameA: WaveMeshFrame
  frameB: WaveMeshFrame
  alpha: number
}

interface FrameVisualSummary {
  t: number
  ts: string
  hsMean: number
  hsMax: number
  tpMean: number
  dirX: number
  dirY: number
}

interface StaticSurfaceMesh {
  orderedGlobalVertices: number[]
  indices: number[]
  stValues: number[]
  sizeXM: number
  sizeYM: number
}

function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalize2D(x: number, y: number) {
  const len = Math.hypot(x, y)
  if (len === 0) return { x: 1, y: 0 }
  return { x: x / len, y: y / len }
}

function getFramePairAtTime(frames: WaveMeshFrame[], timeH: number): FramePair | null {
  if (!frames.length) return null

  if (timeH <= frames[0].t) {
    return {
      indexA: 0,
      indexB: 0,
      frameA: frames[0],
      frameB: frames[0],
      alpha: 0,
    }
  }

  const lastIndex = frames.length - 1

  if (timeH >= frames[lastIndex].t) {
    return {
      indexA: lastIndex,
      indexB: lastIndex,
      frameA: frames[lastIndex],
      frameB: frames[lastIndex],
      alpha: 0,
    }
  }

  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i]
    const b = frames[i + 1]

    if (timeH >= a.t && timeH <= b.t) {
      const dt = b.t - a.t
      const alpha = dt > 0 ? (timeH - a.t) / dt : 0

      return {
        indexA: i,
        indexB: i + 1,
        frameA: a,
        frameB: b,
        alpha,
      }
    }
  }

  return null
}

function nauticalFromDegToTravelVec(dirDeg: number) {
  const rad = CesiumMath.toRadians(270 - dirDeg)
  return {
    x: Math.cos(rad),
    y: Math.sin(rad),
  }
}

function buildVisualSummaries(meshFrames: WaveMeshFramesFile): FrameVisualSummary[] {
  return meshFrames.frames.map(frame => {
    const active = frame.active_vertex_ids
    const sampleStep = Math.max(1, Math.floor(active.length / 500))

    let hsSum = 0
    let tpSum = 0
    let count = 0
    let dirXSum = 0
    let dirYSum = 0

    for (let i = 0; i < active.length; i += sampleStep) {
      const vertexIndex = active[i]
      const hs = frame.vertex_hs[vertexIndex] ?? 0
      const tp = frame.vertex_tp[vertexIndex] ?? 0
      const dirDeg = frame.vertex_dir_deg[vertexIndex] ?? 0

      if (hs <= 0) continue

      const dir = nauticalFromDegToTravelVec(dirDeg)

      hsSum += hs
      tpSum += tp > 0 ? tp : 2.5
      dirXSum += dir.x
      dirYSum += dir.y
      count += 1
    }

    const dir = normalize2D(dirXSum, dirYSum)

    return {
      t: frame.t,
      ts: frame.ts,
      hsMean: count > 0 ? hsSum / count : frame.hs_mean,
      hsMax: frame.hs_max,
      tpMean: count > 0 ? tpSum / count : 2.5,
      dirX: dir.x,
      dirY: dir.y,
    }
  })
}

function getSummaryAtTime(
  summaries: FrameVisualSummary[],
  timeH: number
): FrameVisualSummary | null {
  if (!summaries.length) return null

  if (timeH <= summaries[0].t) return summaries[0]
  if (timeH >= summaries[summaries.length - 1].t) return summaries[summaries.length - 1]

  for (let i = 0; i < summaries.length - 1; i += 1) {
    const a = summaries[i]
    const b = summaries[i + 1]

    if (timeH >= a.t && timeH <= b.t) {
      const dt = b.t - a.t
      const alpha = dt > 0 ? (timeH - a.t) / dt : 0

      const dir = normalize2D(
        lerp(a.dirX, b.dirX, alpha),
        lerp(a.dirY, b.dirY, alpha)
      )

      return {
        t: lerp(a.t, b.t, alpha),
        ts: a.ts,
        hsMean: lerp(a.hsMean, b.hsMean, alpha),
        hsMax: lerp(a.hsMax, b.hsMax, alpha),
        tpMean: lerp(a.tpMean, b.tpMean, alpha),
        dirX: dir.x,
        dirY: dir.y,
      }
    }
  }

  return summaries[0]
}

function buildStaticSurfaceMesh(topology: WaveMeshTopology): StaticSurfaceMesh {
  const usedGlobalVertices = new Set<number>()

  for (const tri of topology.triangles) {
    if (!tri || tri.length !== 3) continue
    usedGlobalVertices.add(tri[0])
    usedGlobalVertices.add(tri[1])
    usedGlobalVertices.add(tri[2])
  }

  const orderedGlobalVertices = Array.from(usedGlobalVertices).sort((a, b) => a - b)
  const globalToLocal = new Map<number, number>()

  for (let i = 0; i < orderedGlobalVertices.length; i += 1) {
    globalToLocal.set(orderedGlobalVertices[i], i)
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const globalIndex of orderedGlobalVertices) {
    const x = topology.vertex_local_x_m[globalIndex] ?? 0
    const y = topology.vertex_local_y_m[globalIndex] ?? 0

    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const sizeXM = Math.max(1, maxX - minX)
  const sizeYM = Math.max(1, maxY - minY)

  const stValues: number[] = []

  for (const globalIndex of orderedGlobalVertices) {
    const x = topology.vertex_local_x_m[globalIndex] ?? 0
    const y = topology.vertex_local_y_m[globalIndex] ?? 0

    const s = (x - minX) / sizeXM
    const t = (y - minY) / sizeYM

    stValues.push(s, t)
  }

  const indices: number[] = []

  for (const tri of topology.triangles) {
    if (!tri || tri.length !== 3) continue

    const i0 = globalToLocal.get(tri[0])
    const i1 = globalToLocal.get(tri[1])
    const i2 = globalToLocal.get(tri[2])

    if (i0 == null || i1 == null || i2 == null) continue
    if (i0 === i1 || i1 === i2 || i0 === i2) continue

    indices.push(i0, i1, i2)
  }

  return {
    orderedGlobalVertices,
    indices,
    stValues,
    sizeXM,
    sizeYM,
  }
}

function createWaterMaterial(surface: StaticSurfaceMesh) {
  return new Material({
    fabric: {
      type: 'LaRochelleVisualWater',
      uniforms: {
        timeS: 0,
        dirX: 1,
        dirY: 0,
        sizeX: surface.sizeXM,
        sizeY: surface.sizeYM,
        wavelength1: 90,
        wavelength2: 34,
        wavelength3: 12,
        speed1: 8,
        speed2: 5,
        speed3: 3,
        waveAmp: 1.1,
        foaminess: 0.45,
        normalStrength: 1.1,
        baseAlpha: 0.66,
        deepColor: new Color(0.03, 0.16, 0.28, 1),
        midColor: new Color(0.04, 0.32, 0.50, 1),
        crestColor: new Color(0.82, 0.92, 0.98, 1),
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput)
        {
          czm_material material = czm_getDefaultMaterial(materialInput);

          vec2 uv = materialInput.st;
          vec2 p = vec2(uv.x * sizeX, uv.y * sizeY);

          vec2 d1 = normalize(vec2(dirX, dirY));
          vec2 d2 = normalize(vec2(-dirY, dirX));
          vec2 d3 = normalize(vec2(dirX * 0.78 - dirY * 0.22, dirY * 0.78 + dirX * 0.22));

          float k1 = 6.28318530718 / max(wavelength1, 1.0);
          float k2 = 6.28318530718 / max(wavelength2, 1.0);
          float k3 = 6.28318530718 / max(wavelength3, 1.0);

          float w1 = sin(k1 * (dot(d1, p) - speed1 * timeS));
          float w2 = sin(k2 * (dot(d2, p) - speed2 * timeS));
          float w3 = sin(k3 * (dot(d3, p) - speed3 * timeS));

          float smallRipples =
            sin((p.x * 0.09 + timeS * 3.0)) * 0.08 +
            sin((p.y * 0.14 - timeS * 2.2)) * 0.06 +
            sin(((p.x + p.y) * 0.11 - timeS * 2.8)) * 0.05;

          float field = w1 * 0.56 + w2 * 0.28 + w3 * 0.16 + smallRipples;
          float normalizedField = field * 0.5 + 0.5;

          float crest = smoothstep(0.62, 0.96, normalizedField + waveAmp * 0.06);
          float foam = smoothstep(0.76, 1.04, normalizedField + waveAmp * 0.08) * foaminess;

          vec3 waterColor = mix(deepColor.rgb, midColor.rgb, clamp(0.35 + normalizedField * 0.7, 0.0, 1.0));
          waterColor = mix(waterColor, crestColor.rgb, crest * 0.45 + foam * 0.55);

          vec3 eyeDir = normalize(materialInput.positionToEyeEC);
          float ndotv = clamp(abs(dot(normalize(materialInput.normalEC), eyeDir)), 0.0, 1.0);
          float fresnel = pow(1.0 - ndotv, 3.0);

          material.diffuse = waterColor;
          material.alpha = clamp(baseAlpha + fresnel * 0.16 + foam * 0.16, 0.0, 0.96);
          material.specular = 0.72 + foam * 0.22;
          material.shininess = 70.0 + crest * 20.0;
          material.normal = normalize(vec3(
            (w1 - w2 * 0.7 + smallRipples * 0.5) * 0.34 * normalStrength,
            (w2 - w3 * 0.8 - smallRipples * 0.4) * 0.34 * normalStrength,
            1.0
          ));
          material.emission = waterColor * fresnel * 0.08;

          return material;
        }
      `,
    },
    translucent: true,
  })
}

export default function LaRochelleWaveView({ onBack }: Props) {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const waterPrimitiveRef = useRef<Primitive | null>(null)
  const waterAppearanceRef = useRef<EllipsoidSurfaceAppearance | null>(null)
  const waterMaterialRef = useRef<Material | null>(null)
  const loopRef = useRef<number | null>(null)
  const lastFrameTsRef = useRef<number | null>(null)
  const lastRenderTsRef = useRef<number>(0)
  const currentTimeHRef = useRef(0)
  const waveTimeSRef = useRef(0)
  const isAnimatingRef = useRef(false)
  const timeSpeedRef = useRef(DEFAULT_TIME_SPEED_H_PER_S)
  const lastBuiltHeightRef = useRef<number | null>(null)

  const [topology, setTopology] = useState<WaveMeshTopology | null>(null)
  const [meshFrames, setMeshFrames] = useState<WaveMeshFramesFile | null>(null)
  const [metadata, setMetadata] = useState<WaveMeshMetadata | null>(null)

  const [viewerReady, setViewerReady] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [currentFrame, setCurrentFrame] = useState(0)
  const [currentTimeH, setCurrentTimeH] = useState(0)
  const [waveTimeS, setWaveTimeS] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const [timeSpeedHPerS, setTimeSpeedHPerS] = useState(DEFAULT_TIME_SPEED_H_PER_S)
  const [waveVisualSpeed, setWaveVisualSpeed] = useState(DEFAULT_WAVE_VISUAL_SPEED)
  const [waveBoost, setWaveBoost] = useState(DEFAULT_WAVE_BOOST)
  const [seaLevelBoost, setSeaLevelBoost] = useState(DEFAULT_SEA_LEVEL_BOOST)
  const [tideAmplitudeM, setTideAmplitudeM] = useState(DEFAULT_TIDE_AMPLITUDE_M)
  const [userVerticalOffsetM, setUserVerticalOffsetM] = useState(0)

  useEffect(() => {
    currentTimeHRef.current = currentTimeH
  }, [currentTimeH])

  useEffect(() => {
    isAnimatingRef.current = isAnimating
  }, [isAnimating])

  useEffect(() => {
    timeSpeedRef.current = timeSpeedHPerS
  }, [timeSpeedHPerS])

  const staticSurface = useMemo(() => {
    if (!topology) return null
    return buildStaticSurfaceMesh(topology)
  }, [topology])

  const summaries = useMemo(() => {
    if (!meshFrames) return []
    return buildVisualSummaries(meshFrames)
  }, [meshFrames])

  const currentPair = useMemo(() => {
    if (!meshFrames) return null
    return getFramePairAtTime(meshFrames.frames, currentTimeH)
  }, [meshFrames, currentTimeH])

  const currentSummary = useMemo(() => {
    if (!summaries.length) return null
    return getSummaryAtTime(summaries, currentTimeH)
  }, [summaries, currentTimeH])

  const requestRender = () => {
    viewer.current?.scene.requestRender()
  }

  const clearWaterPrimitive = () => {
    const v = viewer.current
    const primitive = waterPrimitiveRef.current

    if (!v || !primitive) return

    v.scene.primitives.remove(primitive)
    waterPrimitiveRef.current = null
    requestRender()
  }

  const loadData = async () => {
    const [topologyResponse, framesResponse, metadataResponse] = await Promise.all([
      fetch(TOPOLOGY_URL),
      fetch(FRAMES_URL),
      fetch(METADATA_URL),
    ])

    if (!topologyResponse.ok) {
      throw new Error(`Failed to load ${TOPOLOGY_URL}`)
    }

    if (!framesResponse.ok) {
      throw new Error(`Failed to load ${FRAMES_URL}`)
    }

    if (!metadataResponse.ok) {
      throw new Error(`Failed to load ${METADATA_URL}`)
    }

    const topologyJson = (await topologyResponse.json()) as WaveMeshTopology
    const framesJson = (await framesResponse.json()) as WaveMeshFramesFile
    const metadataJson = (await metadataResponse.json()) as WaveMeshMetadata

    setTopology(topologyJson)
    setMeshFrames(framesJson)
    setMetadata(metadataJson)
    setDataReady(true)
  }

  const ensureWaterAppearance = (surface: StaticSurfaceMesh) => {
    if (waterAppearanceRef.current && waterMaterialRef.current) return

    const material = createWaterMaterial(surface)
    const appearance = new EllipsoidSurfaceAppearance({
      aboveGround: false,
      translucent: true,
      faceForward: true,
    })

    appearance.material = material

    waterMaterialRef.current = material
    waterAppearanceRef.current = appearance
  }

  const rebuildWaterPrimitive = (surfaceHeightM: number) => {
    const v = viewer.current

    if (!v || !topology || !staticSurface) return

    ensureWaterAppearance(staticSurface)
    clearWaterPrimitive()

    const positionValues: number[] = []

    for (const globalIndex of staticSurface.orderedGlobalVertices) {
      const lonlat = topology.vertices_lonlat[globalIndex]
      const cart = Cartesian3.fromDegrees(lonlat[0], lonlat[1], surfaceHeightM)
      positionValues.push(cart.x, cart.y, cart.z)
    }

    const attributes = new GeometryAttributes()

    attributes.position = new GeometryAttribute({
      componentDatatype: ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: new Float64Array(positionValues),
    })

    attributes.st = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 2,
      values: new Float32Array(staticSurface.stValues),
    })

    const geometry = new Geometry({
      attributes,
      indices:
        staticSurface.orderedGlobalVertices.length > 65535
          ? new Uint32Array(staticSurface.indices)
          : new Uint16Array(staticSurface.indices),
      primitiveType: PrimitiveType.TRIANGLES,
      boundingSphere: BoundingSphere.fromVertices(positionValues),
    })

    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry,
      }),
      appearance: waterAppearanceRef.current!,
      asynchronous: false,
      allowPicking: false,
      show: true,
    })

    v.scene.primitives.add(primitive)
    waterPrimitiveRef.current = primitive
    lastBuiltHeightRef.current = surfaceHeightM
    requestRender()
  }

  const updateWaterMaterial = (
    summary: FrameVisualSummary,
    waveTimeSValue: number
  ) => {
    const material = waterMaterialRef.current
    const surface = staticSurface

    if (!material || !surface) return

    const safeHsMean = Math.max(0.05, summary.hsMean)
    const safeHsMax = Math.max(safeHsMean, summary.hsMax)
    const safeTp = clamp(summary.tpMean || 2.5, 1.5, 14)

    const deepWaterLength = clamp(1.56 * safeTp * safeTp, 18, 260)
    const wavelength1 = deepWaterLength
    const wavelength2 = clamp(deepWaterLength * 0.42, 10, 120)
    const wavelength3 = clamp(deepWaterLength * 0.16, 4, 32)

    const waveAmp = clamp(0.55 + safeHsMean * 0.65 * waveBoost, 0.3, 3.2)
    const foaminess = clamp(0.24 + safeHsMax * 0.30, 0.18, 0.95)
    const normalStrength = clamp(0.9 + safeHsMean * 0.45 + waveBoost * 0.12, 0.7, 2.6)
    const baseAlpha = clamp(0.60 + safeHsMean * 0.05, 0.54, 0.82)

    const speed1 = clamp(wavelength1 / Math.max(safeTp, 1.4), 2, 28)
    const speed2 = clamp(wavelength2 / Math.max(safeTp * 0.8, 0.8), 1.5, 22)
    const speed3 = clamp(wavelength3 / Math.max(safeTp * 0.55, 0.5), 1.2, 16)

    const uniforms = material.uniforms as Record<string, any>

    uniforms.timeS = waveTimeSValue * waveVisualSpeed
    uniforms.dirX = summary.dirX
    uniforms.dirY = summary.dirY
    uniforms.sizeX = surface.sizeXM
    uniforms.sizeY = surface.sizeYM
    uniforms.wavelength1 = wavelength1
    uniforms.wavelength2 = wavelength2
    uniforms.wavelength3 = wavelength3
    uniforms.speed1 = speed1
    uniforms.speed2 = speed2
    uniforms.speed3 = speed3
    uniforms.waveAmp = waveAmp
    uniforms.foaminess = foaminess
    uniforms.normalStrength = normalStrength
    uniforms.baseAlpha = baseAlpha
  }

  const computeDynamicSeaLevel = (summary: FrameVisualSummary, timeH: number) => {
    const seaStateLift = summary.hsMean * 0.45 * seaLevelBoost
    const pseudoTide = tideAmplitudeM * Math.sin((2 * Math.PI * timeH) / 12.42)
    return seaStateLift + pseudoTide
  }

  const stopAnimation = () => {
    isAnimatingRef.current = false
    setIsAnimating(false)
  }

  const startAnimation = () => {
    if (!meshFrames || meshFrames.frames.length < 2) return
    isAnimatingRef.current = true
    setIsAnimating(true)
  }

  const jumpToFrame = (index: number) => {
    if (!meshFrames) return

    stopAnimation()

    const clamped = Math.max(0, Math.min(meshFrames.frames.length - 1, index))
    const t = meshFrames.frames[clamped].t

    currentTimeHRef.current = t
    setCurrentTimeH(t)
    setCurrentFrame(clamped)
  }

  useEffect(() => {
    loadData().catch(error => {
      console.error('WW3 visual water loading error:', error)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!meshFrames || meshFrames.frames.length === 0) return

    const startT = meshFrames.frames[0].t
    currentTimeHRef.current = startT
    setCurrentTimeH(startT)
    setCurrentFrame(0)
  }, [meshFrames])

  useEffect(() => {
    if (!staticSurface) return
    ensureWaterAppearance(staticSurface)
  }, [staticSurface])

  useEffect(() => {
    if (viewer.current || !cesiumContainer.current || !metadata) return

    let destroyed = false

    const init = async () => {
      try {
        Ion.defaultAccessToken = CESIUM_TOKEN

        const terrain = await createWorldTerrainAsync({
          requestVertexNormals: true,
          requestWaterMask: true,
        })

        if (destroyed || !cesiumContainer.current) return

        const v = new Viewer(cesiumContainer.current, {
          terrainProvider: terrain,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          shadows: false,
          requestRenderMode: false,
          maximumRenderTimeChange: 0,
        })

        viewer.current = v

        v.imageryLayers.removeAll()
        v.imageryLayers.addImageryProvider(await IonImageryProvider.fromAssetId(2))

        v.scene.logarithmicDepthBuffer = true
        v.scene.globe.depthTestAgainstTerrain = false
        v.scene.globe.enableLighting = true
        v.scene.globe.showGroundAtmosphere = true
        v.scene.highDynamicRange = true
        v.scene.postProcessStages.fxaa.enabled = true
        v.scene.screenSpaceCameraController.minimumZoomDistance = 20
        v.scene.screenSpaceCameraController.maximumZoomDistance = 300000
        v.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5)

        v.camera.flyTo({
          destination: Cartesian3.fromDegrees(
            metadata.center.lon - 0.02,
            metadata.center.lat - 0.01,
            11000
          ),
          orientation: {
            heading: CesiumMath.toRadians(30),
            pitch: CesiumMath.toRadians(-18),
            roll: 0,
          },
          duration: 2.8,
        })

        setViewerReady(true)
        setIsLoading(false)
      } catch (error) {
        console.error('Cesium WW3 init error:', error)
        setIsLoading(false)
      }
    }

    init()

    return () => {
      destroyed = true

      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current)
        loopRef.current = null
      }

      clearWaterPrimitive()

      if (viewer.current) {
        viewer.current.destroy()
        viewer.current = null
      }
    }
  }, [metadata])

  useEffect(() => {
    if (!viewerReady || !topology || !meshFrames || !staticSurface || !summaries.length) return

    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current)
      loopRef.current = null
    }

    lastFrameTsRef.current = null
    lastRenderTsRef.current = 0
    lastBuiltHeightRef.current = null

    const tick = (ts: number) => {
      if (!viewer.current) return

      if (lastFrameTsRef.current == null) {
        lastFrameTsRef.current = ts
      }

      const dtS = (ts - lastFrameTsRef.current) / 1000
      lastFrameTsRef.current = ts

      waveTimeSRef.current += dtS

      if (isAnimatingRef.current) {
        const endT = meshFrames.frames[meshFrames.frames.length - 1].t
        const nextTime = currentTimeHRef.current + dtS * timeSpeedRef.current
        currentTimeHRef.current = Math.min(nextTime, endT)

        if (currentTimeHRef.current >= endT) {
          isAnimatingRef.current = false
          setIsAnimating(false)
        }
      }

      if (ts - lastRenderTsRef.current >= TARGET_RENDER_INTERVAL_MS) {
        const timeH = currentTimeHRef.current
        const waveT = waveTimeSRef.current
        const summary = getSummaryAtTime(summaries, timeH)

        if (summary) {
          const dynamicSeaLevel = computeDynamicSeaLevel(summary, timeH)
          const surfaceHeightM =
            WATER_SURFACE_BASE_M +
            userVerticalOffsetM +
            dynamicSeaLevel

          if (
            lastBuiltHeightRef.current == null ||
            Math.abs(surfaceHeightM - lastBuiltHeightRef.current) > 0.08
          ) {
            rebuildWaterPrimitive(surfaceHeightM)
          }

          updateWaterMaterial(summary, waveT)
        }

        setCurrentTimeH(timeH)
        setWaveTimeS(waveT)

        const pair = getFramePairAtTime(meshFrames.frames, timeH)
        if (pair) {
          setCurrentFrame(pair.indexA)
        }

        requestRender()
        lastRenderTsRef.current = ts
      }

      loopRef.current = requestAnimationFrame(tick)
    }

    loopRef.current = requestAnimationFrame(tick)

    return () => {
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current)
        loopRef.current = null
      }
    }
  }, [
    viewerReady,
    topology,
    meshFrames,
    staticSurface,
    summaries,
    userVerticalOffsetM,
    waveVisualSpeed,
    waveBoost,
    seaLevelBoost,
    tideAmplitudeM,
  ])

  return (
    <>
      <div ref={cesiumContainer} className="map3d-container" />

      <button className="scene-back-btn" onClick={onBack}>
        ← Retour
      </button>

      {isLoading && (
        <div className="map3d-loading">Chargement mer visuelle La Rochelle...</div>
      )}

      <div className="simulation-panel">
        <div className="simulation-title">La Rochelle — Mer visuelle WW3</div>
        <div className="simulation-subtitle">
          {dataReady ? '✅ Eau stylisée pilotée par WW3' : '⏳ Chargement données...'}
        </div>

        <div className="sim-slider-row">
          <span className="sim-label">Frame</span>
          <input
            type="range"
            min={0}
            max={Math.max((meshFrames?.frames.length ?? 1) - 1, 0)}
            step={1}
            value={currentFrame}
            onChange={e => jumpToFrame(parseInt(e.target.value, 10))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#378ADD' }}>
            {currentFrame + 1}
          </span>
        </div>

        <div className="sim-scenarios">
          {meshFrames?.frames.map((frame, index) => (
            <button
              key={`${frame.ts}-${index}`}
              className={`sim-btn ${currentFrame === index ? 'active' : ''}`}
              onClick={() => jumpToFrame(index)}
            >
              {frame.ts.slice(11, 16)}
            </button>
          ))}
        </div>

        <button
          className={`sim-animate-btn ${isAnimating ? 'stop' : ''}`}
          onClick={() => {
            if (isAnimating) {
              stopAnimation()
            } else {
              startAnimation()
            }
          }}
          disabled={!meshFrames}
        >
          {!meshFrames ? '⏳ Chargement...' : isAnimating ? '⏹ Arrêter' : '▶ Lancer animation'}
        </button>

        <div className="sim-slider-row" style={{ marginTop: 10 }}>
          <span className="sim-label">Temps</span>
          <input
            type="range"
            min={0.5}
            max={12}
            step={0.5}
            value={timeSpeedHPerS}
            onChange={e => setTimeSpeedHPerS(parseFloat(e.target.value))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#9ecbff' }}>
            {timeSpeedHPerS.toFixed(1)} h/s
          </span>
        </div>

        <div className="sim-slider-row" style={{ marginTop: 10 }}>
          <span className="sim-label">Vagues</span>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.1}
            value={waveBoost}
            onChange={e => setWaveBoost(parseFloat(e.target.value))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#9ecbff' }}>
            {waveBoost.toFixed(1)}x
          </span>
        </div>

        <div className="sim-slider-row" style={{ marginTop: 10 }}>
          <span className="sim-label">Vitesse visuelle</span>
          <input
            type="range"
            min={1}
            max={18}
            step={0.5}
            value={waveVisualSpeed}
            onChange={e => setWaveVisualSpeed(parseFloat(e.target.value))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#9ecbff' }}>
            {waveVisualSpeed.toFixed(1)}x
          </span>
        </div>

        <div className="sim-slider-row" style={{ marginTop: 10 }}>
          <span className="sim-label">Niveau mer</span>
          <input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={seaLevelBoost}
            onChange={e => setSeaLevelBoost(parseFloat(e.target.value))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#9ecbff' }}>
            {seaLevelBoost.toFixed(1)}x
          </span>
        </div>

        <div className="sim-slider-row" style={{ marginTop: 10 }}>
          <span className="sim-label">Pseudo-marée</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={tideAmplitudeM}
            onChange={e => setTideAmplitudeM(parseFloat(e.target.value))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#9ecbff' }}>
            {tideAmplitudeM.toFixed(1)} m
          </span>
        </div>

        <div className="sim-slider-row" style={{ marginTop: 10 }}>
          <span className="sim-label">Z offset</span>
          <input
            type="range"
            min={-2}
            max={8}
            step={0.1}
            value={userVerticalOffsetM}
            onChange={e => setUserVerticalOffsetM(parseFloat(e.target.value))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#9ecbff' }}>
            {userVerticalOffsetM.toFixed(1)} m
          </span>
        </div>

        <div className="sim-frame-info">
          Temps simulation: {currentTimeH.toFixed(2)} h
        </div>

        <div className="sim-frame-info">
          Temps visuel: {waveTimeS.toFixed(1)} s
        </div>

        {currentPair && (
          <div className="sim-frame-info">
            Interp: F{currentPair.indexA + 1} → F{currentPair.indexB + 1} — α={currentPair.alpha.toFixed(2)}
          </div>
        )}

        {metadata && (
          <div className="sim-frame-info">
            Résolution: {metadata.resolution_m} m
          </div>
        )}

        {staticSurface && (
          <div className="sim-frame-info">
            Surface: {staticSurface.orderedGlobalVertices.length} sommets — {staticSurface.indices.length / 3} triangles
          </div>
        )}

        {currentSummary && (
          <>
            <div className="sim-frame-info">
              Hs moy: {currentSummary.hsMean.toFixed(2)} m
            </div>
            <div className="sim-frame-info">
              Hs max: {currentSummary.hsMax.toFixed(2)} m
            </div>
            <div className="sim-frame-info">
              Tp moy: {currentSummary.tpMean.toFixed(2)} s
            </div>
          </>
        )}

        <div className="sim-info" style={{ borderColor: '#378ADD' }}>
          <span style={{ color: '#378ADD', fontWeight: 600 }}>
            {metadata?.project ?? 'La Rochelle WW3'}
          </span>
          <span style={{ color: '#888', fontSize: 11 }}>
            {' '}— shader eau + pilotage WW3
          </span>
        </div>
      </div>
    </>
  )
}