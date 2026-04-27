import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  IonImageryProvider,
  Cartesian3,
  Cartesian4,
  Cartographic,
  Math as CesiumMath,
  Color,
  Cesium3DTileFeature,
  Cesium3DTileStyle,
  Cesium3DTileset,
  ShadowMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
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
  sampleTerrainMostDetailed,
  buildModuleUrl,
  JulianDate,
  Matrix4,
  PostProcessStage,
  Transforms,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D/Map3D.css'

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

const TOPOLOGY_URL = '/data/larochelle/topology.json'
const MESH_FRAMES_URL = '/data/larochelle/frames.json'
const METADATA_URL = '/data/larochelle/metadata.json'

const TARGET_RENDER_INTERVAL_MS = 70
const DEFAULT_PLAYBACK_SPEED = 240
const WATER_SURFACE_LIFT_M = 0.04
const MIN_ACTIVE_TRIANGLE_DEPTH_M = 0.03
const VISUAL_WAVE_TIME_SCALE = 1.0
const DAYLIGHT_TIME_ISO = '2026-04-02T12:00:00Z'

const WAVE_1_AMPLITUDE_M = 0.22
const WAVE_1_LENGTH_M = 46
const WAVE_1_SPEED_MPS = 1.5
const WAVE_1_DIR_X = 0.8
const WAVE_1_DIR_Y = 0.28

const WAVE_2_AMPLITUDE_M = 0.1
const WAVE_2_LENGTH_M = 20
const WAVE_2_SPEED_MPS = 0.9
const WAVE_2_DIR_X = -0.25
const WAVE_2_DIR_Y = 1.0

const WAVE_3_AMPLITUDE_M = 0.45
const WAVE_3_LENGTH_M = 9
const WAVE_3_SPEED_MPS = 1.9
const WAVE_3_DIR_X = 0.65
const WAVE_3_DIR_Y = 0.75

const WATER_RIPPLE_SCALE = 78.0
const WATER_RIPPLE_SPEED = 0.42
const WATER_RIPPLE_INTENSITY = 0.5
const WATER_RIPPLE_ALPHA_BOOST = 0.06
const WATER_RIPPLE_MAX_RADIUS = 0.16

const FLOODED_BUILDING_COLOR = Color.fromCssColorString('#ff3b30')
const SELECTED_BUILDING_COLOR = Color.fromCssColorString('#4a9eff')

const BUILDING_LIGHT = Color.fromCssColorString('#f6efe5')
const BUILDING_MID = Color.fromCssColorString('#e7dbcc')
const BUILDING_DARK = Color.fromCssColorString('#d1c3b2')
const BUILDING_INDUS = Color.fromCssColorString('#d8d0c3')
const BUILDING_TOWER = Color.fromCssColorString('#e9e2d8')
const BUILDING_RESIDENTIAL = Color.fromCssColorString('#f4ecdf')

interface Props {
  onBack: () => void
}

interface BuildingInfo {
  name: string
  height: string
  type: string
  address: string
  flooded: boolean
}

interface LaRochelleVertex {
  id: number
  lon: number
  lat: number
  local_x: number
  local_y: number
  terrain: number | null
}

interface LaRochelleTopology {
  vertices: LaRochelleVertex[]
  triangles: number[][]
}

interface LaRochelleFrame {
  index: number
  time: number
  wet_vertex_ids: number[]
  water_heights: number[]
  free_surface: number[]
  u?: number[]
  v?: number[]
  active_triangle_ids: number[]
}

interface LaRochelleFramesFile {
  frames: LaRochelleFrame[]
}

interface LaRochelleMetadata {
  name?: string
  source?: string
  input_crs?: string
  node_count?: number
  triangle_count?: number
  frame_count?: number
  original_time_count?: number
  frame_step?: number
  min_depth?: number
  bbox: {
    west: number
    south: number
    east: number
    north: number
  }
  center: {
    lon: number
    lat: number
  }
  time?: {
    unit: string
    start: number
    end: number
    values: number[]
  }
  ranges?: Record<string, unknown>
  attributes?: Record<string, string>
}

interface FramePair {
  indexA: number
  indexB: number
  frameA: LaRochelleFrame
  frameB: LaRochelleFrame
  alpha: number
}

interface FloodedTriangle {
  ax: number
  ay: number
  bx: number
  by: number
  cx: number
  cy: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function hashStringToUnit(value: string) {
  let hash = 2166136261

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 4294967295
}

function getFramePairAtTime(frames: LaRochelleFrame[], timeS: number): FramePair | null {
  if (!frames.length) return null

  if (timeS <= frames[0].time) {
    return {
      indexA: 0,
      indexB: 0,
      frameA: frames[0],
      frameB: frames[0],
      alpha: 0,
    }
  }

  const lastIndex = frames.length - 1

  if (timeS >= frames[lastIndex].time) {
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

    if (timeS >= a.time && timeS <= b.time) {
      const dt = b.time - a.time
      const alpha = dt > 0 ? (timeS - a.time) / dt : 0

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

function buildFrameMaps(frame: LaRochelleFrame) {
  const depth = new Map<number, number>()
  const surface = new Map<number, number>()

  for (let i = 0; i < frame.wet_vertex_ids.length; i += 1) {
    const id = frame.wet_vertex_ids[i]
    depth.set(id, frame.water_heights[i])
    surface.set(id, frame.free_surface[i])
  }

  return { depth, surface }
}

function buildTriangleSet(frameA: LaRochelleFrame, frameB: LaRochelleFrame) {
  const set = new Set<number>()

  for (const id of frameA.active_triangle_ids) set.add(id)
  for (const id of frameB.active_triangle_ids) set.add(id)

  return Array.from(set).sort((a, b) => a - b)
}

function normalize2D(x: number, y: number) {
  const len = Math.hypot(x, y)

  if (len === 0) {
    return { x: 1, y: 0 }
  }

  return { x: x / len, y: y / len }
}

function degreesToLocalMeters(lon: number, lat: number, centerLon: number, centerLat: number) {
  const metersPerDegLat = 111320
  const metersPerDegLon = Math.cos((centerLat * Math.PI) / 180) * 111320

  return {
    x: (lon - centerLon) * metersPerDegLon,
    y: (lat - centerLat) * metersPerDegLat,
  }
}

function waveComponent(x: number, y: number, timeS: number, amplitudeM: number, wavelengthM: number, speedMps: number, dirX: number, dirY: number) {
  const dir = normalize2D(dirX, dirY)
  const k = (2 * Math.PI) / wavelengthM
  const phase = k * (dir.x * x + dir.y * y - speedMps * timeS)
  return amplitudeM * Math.sin(phase)
}

function computeWaveOffsetMeters(x: number, y: number, timeS: number, depthM: number) {
  const depthFactor = Math.max(0, Math.min(1, (depthM - 0.05) / 0.8))

  const swell =
    waveComponent(x, y, timeS, WAVE_1_AMPLITUDE_M, WAVE_1_LENGTH_M, WAVE_1_SPEED_MPS, WAVE_1_DIR_X, WAVE_1_DIR_Y) +
    waveComponent(x, y, timeS, WAVE_2_AMPLITUDE_M, WAVE_2_LENGTH_M, WAVE_2_SPEED_MPS, WAVE_2_DIR_X, WAVE_2_DIR_Y) +
    waveComponent(x, y, timeS, WAVE_3_AMPLITUDE_M, WAVE_3_LENGTH_M, WAVE_3_SPEED_MPS, WAVE_3_DIR_X, WAVE_3_DIR_Y)

  return swell * depthFactor
}

function createWaterAppearance(timeS: number, rainAmount: number) {
  const appearance = new EllipsoidSurfaceAppearance({
    aboveGround: false,
    translucent: true,
    faceForward: true,
  })

  appearance.material = new Material({
    fabric: {
      type: 'LaRochelleFloodRippleWater',
      uniforms: {
        baseWaterColor: new Color(0.04, 0.32, 0.58, 0.36),
        blendColor: new Color(0.05, 0.25, 0.45, 0.14),
        normalMap: buildModuleUrl('Assets/Textures/waterNormalsSmall.jpg'),
        time: timeS,
        rainAmount,
        amplitude: 0.03,
        specularIntensity: 0.58,
        rippleScale: WATER_RIPPLE_SCALE,
        rippleSpeed: WATER_RIPPLE_SPEED,
        rippleIntensity: WATER_RIPPLE_INTENSITY,
        rippleAlphaBoost: WATER_RIPPLE_ALPHA_BOOST,
        rippleMaxRadius: WATER_RIPPLE_MAX_RADIUS,
      },
      source: `
        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float rippleCell(vec2 uv, float t, float scale, float speed, float maxRadius) {
          vec2 gridUv = uv * scale;
          vec2 cell = floor(gridUv);
          vec2 f = fract(gridUv) - 0.5;

          float seed = hash12(cell);
          vec2 center = vec2(
            hash12(cell + vec2(1.73, 9.21)),
            hash12(cell + vec2(6.12, 2.44))
          ) - 0.5;

          center *= 0.16;

          float phase = fract(t * speed + seed);
          float d = length(f - center);
          float radius = phase * maxRadius;
          float ring = exp(-140.0 * abs(d - radius));
          float core = exp(-260.0 * d) * 0.06;

          return (ring + core) * (1.0 - phase);
        }

        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);

          vec2 uv = materialInput.st;
          float t = time;

          vec2 flowUv1 = fract(uv * 18.0 + vec2(t * 0.018, t * 0.012));
          vec2 flowUv2 = fract(uv * 24.0 + vec2(-t * 0.009, t * 0.014));

          vec3 normalSample1 = texture(normalMap, flowUv1).rgb * 2.0 - 1.0;
          vec3 normalSample2 = texture(normalMap, flowUv2).rgb * 2.0 - 1.0;

          vec2 flow = (normalSample1.xy + normalSample2.xy) * amplitude * 2.2;

          float rippleA = rippleCell(uv, t, rippleScale, rippleSpeed, rippleMaxRadius);
          float rippleB = rippleCell(uv + vec2(0.173, 0.287), t * 1.11, rippleScale * 1.22, rippleSpeed * 0.91, rippleMaxRadius * 0.92);
          float rippleC = rippleCell(uv + vec2(0.511, 0.041), t * 0.87, rippleScale * 0.82, rippleSpeed * 1.17, rippleMaxRadius * 0.88);

          float ripple = clamp(rippleA + 0.7 * rippleB + 0.8 * rippleC, 0.0, 1.0) * rainAmount;

          vec3 deepColor = mix(blendColor.rgb, baseWaterColor.rgb, 0.72);
          vec3 rippleColor = mix(deepColor, vec3(0.94, 0.98, 1.0), ripple * rippleIntensity);
          vec3 finalColor = rippleColor + vec3(ripple * 0.05);

          material.diffuse = finalColor;
          material.normal = normalize(vec3(flow + vec2(ripple * 0.22), 1.0));
          material.specular = specularIntensity + ripple * 0.12;
          material.shininess = 20.0 + ripple * 18.0;
          material.alpha = clamp(baseWaterColor.a + ripple * rippleAlphaBoost, 0.0, 0.82);

          return material;
        }
      `,
    },
  })

  return appearance
}

function pointSign(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by)
}

function pointInTriangle2D(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const d1 = pointSign(px, py, ax, ay, bx, by)
  const d2 = pointSign(px, py, bx, by, cx, cy)
  const d3 = pointSign(px, py, cx, cy, ax, ay)

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0

  return !(hasNeg && hasPos)
}

function getVertexTerrain(topology: LaRochelleTopology, vertexIndex: number) {
  const terrain = topology.vertices[vertexIndex]?.terrain
  return Number.isFinite(terrain) ? Number(terrain) : 0
}

function getInterpolatedDepth(vertexId: number, pair: FramePair, mapsA: ReturnType<typeof buildFrameMaps>, mapsB: ReturnType<typeof buildFrameMaps>) {
  const a = mapsA.depth.get(vertexId) ?? 0
  const b = mapsB.depth.get(vertexId) ?? 0
  return lerp(a, b, pair.alpha)
}

function getInterpolatedSurface(vertexId: number, terrainM: number, pair: FramePair, mapsA: ReturnType<typeof buildFrameMaps>, mapsB: ReturnType<typeof buildFrameMaps>) {
  const fallbackA = terrainM + (mapsA.depth.get(vertexId) ?? 0)
  const fallbackB = terrainM + (mapsB.depth.get(vertexId) ?? 0)
  const a = mapsA.surface.get(vertexId) ?? fallbackA
  const b = mapsB.surface.get(vertexId) ?? fallbackB
  return lerp(a, b, pair.alpha)
}

function buildFloodedTriangles(topology: LaRochelleTopology, pair: FramePair, mapsA: ReturnType<typeof buildFrameMaps>, mapsB: ReturnType<typeof buildFrameMaps>, activeTriangleIds: number[]) {
  const floodedTriangles: FloodedTriangle[] = []

  for (const triId of activeTriangleIds) {
    const tri = topology.triangles[triId]
    if (!tri || tri.length !== 3) continue

    const d0 = getInterpolatedDepth(tri[0], pair, mapsA, mapsB)
    const d1 = getInterpolatedDepth(tri[1], pair, mapsA, mapsB)
    const d2 = getInterpolatedDepth(tri[2], pair, mapsA, mapsB)
    const avgDepth = (d0 + d1 + d2) / 3

    if (avgDepth <= MIN_ACTIVE_TRIANGLE_DEPTH_M) continue

    const p0 = topology.vertices[tri[0]]
    const p1 = topology.vertices[tri[1]]
    const p2 = topology.vertices[tri[2]]

    if (!p0 || !p1 || !p2) continue

    floodedTriangles.push({
      ax: p0.local_x,
      ay: p0.local_y,
      bx: p1.local_x,
      by: p1.local_y,
      cx: p2.local_x,
      cy: p2.local_y,
      minX: Math.min(p0.local_x, p1.local_x, p2.local_x),
      minY: Math.min(p0.local_y, p1.local_y, p2.local_y),
      maxX: Math.max(p0.local_x, p1.local_x, p2.local_x),
      maxY: Math.max(p0.local_y, p1.local_y, p2.local_y),
    })
  }

  return floodedTriangles
}

export default function LaRochelleFloodView({ onBack }: Props) {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const handler = useRef<ScreenSpaceEventHandler | null>(null)
  const buildingsTilesetRef = useRef<Cesium3DTileset | null>(null)
  const selectedBuilding = useRef<Cesium3DTileFeature | null>(null)
  const selectedBuildingKeyRef = useRef<string | null>(null)
  const visibleBuildingFeaturesRef = useRef<Map<string, Cesium3DTileFeature>>(new Map())
  const currentFloodedTrianglesRef = useRef<FloodedTriangle[]>([])
  const waterPrimitiveRef = useRef<Primitive | null>(null)
  const rainStageRef = useRef<PostProcessStage | null>(null)

  const loopRef = useRef<number | null>(null)
  const lastFrameTsRef = useRef<number | null>(null)
  const lastRenderTsRef = useRef<number>(0)

  const currentTimeSRef = useRef(0)
  const playbackSpeedRef = useRef(DEFAULT_PLAYBACK_SPEED)
  const isAnimatingRef = useRef(false)
  const waveTimeSRef = useRef(0)

  const [topology, setTopology] = useState<LaRochelleTopology | null>(null)
  const [meshFrames, setMeshFrames] = useState<LaRochelleFramesFile | null>(null)
  const [metadata, setMetadata] = useState<LaRochelleMetadata | null>(null)

  const [viewerReady, setViewerReady] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [currentFrame, setCurrentFrame] = useState(0)
  const [currentTimeS, setCurrentTimeS] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(DEFAULT_PLAYBACK_SPEED)
  const [isAnimating, setIsAnimating] = useState(false)
  const [buildingInfo, setBuildingInfo] = useState<BuildingInfo | null>(null)

  const [autoVerticalOffsetM, setAutoVerticalOffsetM] = useState(0)
  const [userVerticalOffsetM, setUserVerticalOffsetM] = useState(0)

  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const effectiveVerticalOffsetM = autoVerticalOffsetM + userVerticalOffsetM

  const currentPair = useMemo(() => {
    if (!meshFrames) return null
    return getFramePairAtTime(meshFrames.frames, currentTimeS)
  }, [meshFrames, currentTimeS])

  const interpolatedFloodedTriangles = useMemo(() => {
    if (!currentPair) return 0
    return Math.round(lerp(currentPair.frameA.active_triangle_ids.length, currentPair.frameB.active_triangle_ids.length, currentPair.alpha))
  }, [currentPair])

  const peakFrameIndex = useMemo(() => {
    if (!meshFrames) return 0

    let bestIndex = 0
    let bestValue = -1

    for (let i = 0; i < meshFrames.frames.length; i += 1) {
      const value = meshFrames.frames[i].active_triangle_ids.length
      if (value > bestValue) {
        bestValue = value
        bestIndex = i
      }
    }

    return bestIndex
  }, [meshFrames])

  const totalFrames = meshFrames?.frames.length ?? 0
  const progressPercent = totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 100 : 0

  useEffect(() => {
    currentTimeSRef.current = currentTimeS
  }, [currentTimeS])

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed
  }, [playbackSpeed])

  useEffect(() => {
    isAnimatingRef.current = isAnimating
  }, [isAnimating])

  const requestRender = () => {
    viewer.current?.scene.requestRender()
  }

  const getFeatureKey = (feature: Cesium3DTileFeature) => {
    const elementType = feature.getProperty('elementType')
    const elementId = feature.getProperty('elementId')

    if (elementType != null && elementId != null) {
      return `${String(elementType)}:${String(elementId)}`
    }

    const lon = Number(feature.getProperty('cesium#longitude'))
    const lat = Number(feature.getProperty('cesium#latitude'))

    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      return `${lon.toFixed(7)}:${lat.toFixed(7)}`
    }

    return null
  }

  const getBaseBuildingColor = (feature: Cesium3DTileFeature) => {
    const key = getFeatureKey(feature) || String(feature.getProperty('name') || feature.getProperty('building') || '')
    const rawHeight = Number(feature.getProperty('cesium#estimatedHeight') || feature.getProperty('height') || 12)
    const buildingType = String(feature.getProperty('building') || '').toLowerCase()
    const jitter = hashStringToUnit(key)
    const heightMix = clamp01(Number.isFinite(rawHeight) ? rawHeight / 80 : 0.2)

    let base = BUILDING_LIGHT

    if (buildingType.includes('industrial') || buildingType.includes('warehouse') || buildingType.includes('commercial') || buildingType.includes('retail') || buildingType.includes('supermarket')) {
      base = BUILDING_INDUS
    } else if (buildingType.includes('apartments') || buildingType.includes('residential') || buildingType.includes('house') || buildingType.includes('detached') || buildingType.includes('terrace')) {
      base = BUILDING_RESIDENTIAL
    } else if (buildingType.includes('office') || buildingType.includes('hotel') || rawHeight > 45) {
      base = BUILDING_TOWER
    } else {
      base = BUILDING_MID
    }

    const darkBlend = 0.12 + heightMix * 0.28 + jitter * 0.1
    const lightBlend = 0.1 + (1 - heightMix) * 0.15
    const temp = Color.lerp(base, BUILDING_DARK, darkBlend, new Color())
    const out = Color.lerp(temp, BUILDING_LIGHT, lightBlend * 0.35, new Color())
    out.alpha = 1

    return out
  }

  const isFeatureFlooded = (feature: Cesium3DTileFeature) => {
    if (!metadata) return false

    const lon = Number(feature.getProperty('cesium#longitude'))
    const lat = Number(feature.getProperty('cesium#latitude'))

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false

    if (lon < metadata.bbox.west || lon > metadata.bbox.east || lat < metadata.bbox.south || lat > metadata.bbox.north) {
      return false
    }

    const local = degreesToLocalMeters(lon, lat, metadata.center.lon, metadata.center.lat)
    const floodedTriangles = currentFloodedTrianglesRef.current

    for (let i = 0; i < floodedTriangles.length; i += 1) {
      const tri = floodedTriangles[i]

      if (local.x < tri.minX || local.x > tri.maxX || local.y < tri.minY || local.y > tri.maxY) {
        continue
      }

      if (pointInTriangle2D(local.x, local.y, tri.ax, tri.ay, tri.bx, tri.by, tri.cx, tri.cy)) {
        return true
      }
    }

    return false
  }

  const applyColorToFeature = (feature: Cesium3DTileFeature) => {
    const key = getFeatureKey(feature)

    if (key && selectedBuildingKeyRef.current === key) {
      feature.color = Color.clone(SELECTED_BUILDING_COLOR, new Color())
      selectedBuilding.current = feature
      return
    }

    feature.color = isFeatureFlooded(feature) ? Color.clone(FLOODED_BUILDING_COLOR, new Color()) : getBaseBuildingColor(feature)
  }

  const refreshSelectedBuildingFloodState = () => {
    if (!selectedBuilding.current) return

    const flooded = isFeatureFlooded(selectedBuilding.current)

    setBuildingInfo(prev => {
      if (!prev) return prev
      return {
        ...prev,
        flooded,
      }
    })
  }

  const updateVisibleBuildingColors = () => {
    visibleBuildingFeaturesRef.current.forEach(feature => {
      applyColorToFeature(feature)
    })

    refreshSelectedBuildingFloodState()
    requestRender()
  }

  const resetSelectedBuilding = () => {
    const previous = selectedBuilding.current

    selectedBuilding.current = null
    selectedBuildingKeyRef.current = null

    if (previous) {
      applyColorToFeature(previous)
    }

    updateVisibleBuildingColors()
  }

  const clearWaterPrimitive = () => {
    const v = viewer.current
    const primitive = waterPrimitiveRef.current

    if (!v || !primitive) return

    v.scene.primitives.remove(primitive)
    waterPrimitiveRef.current = null
    requestRender()
  }

  const clearRainStage = () => {
    const v = viewer.current
    const stage = rainStageRef.current

    if (!v || !stage) return

    stage.enabled = false
    v.scene.postProcessStages.remove(stage)

    if (!stage.isDestroyed()) {
      stage.destroy()
    }

    rainStageRef.current = null
    requestRender()
  }

  const setRainEnabled = (enabled: boolean) => {
    const stage = rainStageRef.current
    if (!stage) return
    stage.enabled = enabled
    requestRender()
  }

  const createRainStage = (centerLon: number, centerLat: number, effectHei = 0, effectDxRad = 0, effectDyRad = 0) => {
    const v = viewer.current
    if (!v || rainStageRef.current) return

    const effectCenter = Cartesian3.fromDegrees(centerLon, centerLat, effectHei)
    const effectFrame = Transforms.eastNorthUpToFixedFrame(effectCenter)
    const inverseEffectFrame = Matrix4.inverseTransformation(effectFrame, new Matrix4())

    const computeRainState = () => {
      const cam = v.camera
      const rightLocal = Matrix4.multiplyByPointAsVector(inverseEffectFrame, cam.right, new Cartesian3())
      const upLocal = Matrix4.multiplyByPointAsVector(inverseEffectFrame, cam.up, new Cartesian3())
      const dirLocal = Matrix4.multiplyByPointAsVector(inverseEffectFrame, cam.direction, new Cartesian3())
      const posLocal = Matrix4.multiplyByPoint(inverseEffectFrame, cam.position, new Cartesian3())

      Cartesian3.normalize(rightLocal, rightLocal)
      Cartesian3.normalize(upLocal, upLocal)
      Cartesian3.normalize(dirLocal, dirLocal)

      const carto = Cartographic.fromCartesian(cam.position)
      const height = Number.isFinite(carto.height) ? carto.height : 0

      return {
        height,
        rightLocal,
        upLocal,
        dirLocal,
        posLocal,
      }
    }

    const fragmentShader = `
      uniform sampler2D colorTexture;
      in vec2 v_textureCoordinates;

      uniform vec4 rainPars0;
      uniform vec4 rainPars1;
      uniform vec4 rainPars2;
      uniform vec4 rainPars3;

      mat2 Rot(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat2(c, -s, s, c);
      }

      float hash11(float p) {
        p = fract(p * 0.1031);
        p *= p + 33.33;
        p *= p + p;
        return fract(p);
      }

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float sdSphere(vec3 p, float s) {
        return length(p) - s;
      }

      vec3 repeat3(vec3 p, vec3 c) {
        return mod(p, c) - 0.5 * c;
      }

      vec3 modularsnap(vec3 p, float size) {
        return floor(p * size);
      }

      float rainsdf(vec3 p) {
        float rainsize = 0.125;
        float snapsize = 0.75;
        float iTime = czm_frameNumber * 0.01;

        p.xy *= Rot(rainPars3.z);
        p.zy *= Rot(rainPars3.w);

        vec3 m = modularsnap(p, snapsize);

        float x = 1.0 - 2.0 * hash12((m.xz + 0.5) * 1.31457453);
        float z = 1.0 - 2.0 * hash12((m.xz + 0.2) * 1.41569562);
        float yrandom = hash12(m.xz * 1.4234123);
        float rainspeed = 2.5 + 0.3 * hash11(yrandom);

        vec3 randomoffset = vec3(
          x * snapsize * 0.25,
          -iTime * rainspeed + yrandom,
          z * snapsize * 0.25
        );

        p = repeat3(p - randomoffset, vec3(snapsize));
        p.y *= 0.015;

        return sdSphere(p, rainsize * 0.0025);
      }

      vec4 raymarch(vec3 o, vec3 d, out float dis, vec4 origincol) {
        vec3 color = vec3(0.0);
        float t = 0.5;
        float maxdist = 32000.0;
        float fade = 0.0;

        for (int i = 0; i < 32; i++) {
          vec3 p = o + d * t;
          float plane = p.z - rainPars3.y;
          float r = rainsdf(p.xzy);
          r = min(r, plane);

          float dist = r;
          t += dist;

          if (dist < 0.001 || t > maxdist) {
            if (dist < 0.001 && r < plane) {
              color += mix(origincol.rgb, vec3(1.0), 0.4);
              fade = 1.0;
            }
            break;
          }
        }

        dis = t;
        return vec4(color, fade);
      }

      void main() {
        vec4 baseColor = texture(colorTexture, v_textureCoordinates);

        float height = rainPars0.x;
        if (height > 11000.0) {
          out_FragColor = baseColor;
          return;
        }

        vec3 rgt = vec3(rainPars0.y, rainPars0.z, rainPars0.w);
        vec3 up = vec3(rainPars1.x, rainPars1.y, rainPars1.z);
        vec3 dir = vec3(rainPars1.w, rainPars2.x, rainPars2.y);
        vec3 ro = vec3(rainPars2.z, rainPars2.w, rainPars3.x);

        vec2 uv = (gl_FragCoord.xy - 0.5 * czm_viewport.zw) / czm_viewport.w;
        vec3 rd = normalize(dir + uv.x * rgt + uv.y * up);

        float dis = 0.0;
        vec4 raincolor = raymarch(ro, rd, dis, baseColor);

        out_FragColor = mix(baseColor, raincolor, raincolor.a);
      }
    `

    const stage = new PostProcessStage({
      name: 'larochelle-rain-shader',
      fragmentShader,
      uniforms: {
        rainPars0: () => {
          const s = computeRainState()
          return new Cartesian4(s.height, s.rightLocal.x, s.rightLocal.y, s.rightLocal.z)
        },
        rainPars1: () => {
          const s = computeRainState()
          return new Cartesian4(s.upLocal.x, s.upLocal.y, s.upLocal.z, s.dirLocal.x)
        },
        rainPars2: () => {
          const s = computeRainState()
          return new Cartesian4(s.dirLocal.y, s.dirLocal.z, s.posLocal.x, s.posLocal.y)
        },
        rainPars3: () => {
          const s = computeRainState()
          return new Cartesian4(s.posLocal.z, effectHei, effectDxRad, effectDyRad)
        },
      },
    })

    stage.enabled = false
    v.scene.postProcessStages.add(stage)
    rainStageRef.current = stage
  }

  const loadData = async () => {
    const [topologyResponse, framesResponse, metadataResponse] = await Promise.all([
      fetch(TOPOLOGY_URL),
      fetch(MESH_FRAMES_URL),
      fetch(METADATA_URL),
    ])

    if (!topologyResponse.ok) throw new Error(`Failed to load ${TOPOLOGY_URL}`)
    if (!framesResponse.ok) throw new Error(`Failed to load ${MESH_FRAMES_URL}`)
    if (!metadataResponse.ok) throw new Error(`Failed to load ${METADATA_URL}`)

    const topologyJson = (await topologyResponse.json()) as LaRochelleTopology
    const framesJson = (await framesResponse.json()) as LaRochelleFramesFile
    const metadataJson = (await metadataResponse.json()) as LaRochelleMetadata

    setTopology(topologyJson)
    setMeshFrames(framesJson)
    setMetadata(metadataJson)
    setDataReady(true)
  }

  const computeAutoVerticalOffset = async () => {
    const v = viewer.current

    if (!v || !topology || topology.vertices.length === 0) return

    const sampleCount = Math.min(180, topology.vertices.length)
    const step = Math.max(1, Math.floor(topology.vertices.length / sampleCount))
    const cartographics: Cartographic[] = []
    const sourceHeights: number[] = []

    for (let i = 0; i < topology.vertices.length && cartographics.length < sampleCount; i += step) {
      const vertex = topology.vertices[i]
      const terrainM = vertex.terrain

      if (!Number.isFinite(vertex.lon) || !Number.isFinite(vertex.lat)) continue
      if (!Number.isFinite(terrainM)) continue

      cartographics.push(Cartographic.fromDegrees(vertex.lon, vertex.lat))
      sourceHeights.push(Number(terrainM))
    }

    const sampled = await sampleTerrainMostDetailed(v.terrainProvider, cartographics)
    const deltas: number[] = []

    for (let i = 0; i < sampled.length; i += 1) {
      const terrainCesiumM = sampled[i]?.height
      const terrainMeshM = sourceHeights[i]

      if (!Number.isFinite(terrainCesiumM) || !Number.isFinite(terrainMeshM)) continue

      deltas.push(Number(terrainCesiumM) - Number(terrainMeshM))
    }

    if (!deltas.length) return

    deltas.sort((a, b) => a - b)
    const median = deltas[Math.floor(deltas.length * 0.5)]
    setAutoVerticalOffsetM(median)
  }

  const renderInterpolatedMeshAtTime = (timeS: number, visualWaveTimeS: number) => {
    const v = viewer.current

    if (!v || !topology || !meshFrames || !metadata) return

    const pair = getFramePairAtTime(meshFrames.frames, timeS)
    if (!pair) return

    clearWaterPrimitive()

    const mapsA = buildFrameMaps(pair.frameA)
    const mapsB = buildFrameMaps(pair.frameB)
    const activeTriangleIds = buildTriangleSet(pair.frameA, pair.frameB)
    const floodedTriangles = buildFloodedTriangles(topology, pair, mapsA, mapsB, activeTriangleIds)

    currentFloodedTrianglesRef.current = floodedTriangles
    updateVisibleBuildingColors()

    if (!activeTriangleIds.length) {
      requestRender()
      return
    }

    const usedGlobalVertices = new Set<number>()

    for (const triId of activeTriangleIds) {
      const tri = topology.triangles[triId]
      if (!tri || tri.length !== 3) continue
      usedGlobalVertices.add(tri[0])
      usedGlobalVertices.add(tri[1])
      usedGlobalVertices.add(tri[2])
    }

    const orderedGlobalVertices = Array.from(usedGlobalVertices).sort((a, b) => a - b)

    if (orderedGlobalVertices.length === 0) {
      requestRender()
      return
    }

    const globalToLocal = new Map<number, number>()
    const positionValues: number[] = []
    const stValues: number[] = []
    const localDepths: number[] = []

    const lonMin = metadata.bbox.west
    const lonMax = metadata.bbox.east
    const latMin = metadata.bbox.south
    const latMax = metadata.bbox.north
    const lonSpan = Math.max(1e-9, lonMax - lonMin)
    const latSpan = Math.max(1e-9, latMax - latMin)

    for (let localIndex = 0; localIndex < orderedGlobalVertices.length; localIndex += 1) {
      const globalIndex = orderedGlobalVertices[localIndex]
      const vertex = topology.vertices[globalIndex]

      if (!vertex) continue

      const terrainM = getVertexTerrain(topology, globalIndex)
      const depthM = getInterpolatedDepth(globalIndex, pair, mapsA, mapsB)
      const surfaceM = getInterpolatedSurface(globalIndex, terrainM, pair, mapsA, mapsB)
      const waveOffsetM = computeWaveOffsetMeters(vertex.local_x, vertex.local_y, visualWaveTimeS * VISUAL_WAVE_TIME_SCALE, depthM)
      const finalHeightM = surfaceM + effectiveVerticalOffsetM + WATER_SURFACE_LIFT_M + waveOffsetM
      const cart = Cartesian3.fromDegrees(vertex.lon, vertex.lat, finalHeightM)

      positionValues.push(cart.x, cart.y, cart.z)
      stValues.push((vertex.lon - lonMin) / lonSpan, (vertex.lat - latMin) / latSpan)
      localDepths.push(depthM)
      globalToLocal.set(globalIndex, localIndex)
    }

    const indexValues: number[] = []

    for (const triId of activeTriangleIds) {
      const tri = topology.triangles[triId]
      if (!tri || tri.length !== 3) continue

      const i0 = globalToLocal.get(tri[0])
      const i1 = globalToLocal.get(tri[1])
      const i2 = globalToLocal.get(tri[2])

      if (i0 == null || i1 == null || i2 == null) continue

      const avgDepth = (localDepths[i0] + localDepths[i1] + localDepths[i2]) / 3

      if (avgDepth <= MIN_ACTIVE_TRIANGLE_DEPTH_M) continue
      if (i0 === i1 || i1 === i2 || i0 === i2) continue

      indexValues.push(i0, i1, i2)
    }

    if (!indexValues.length) {
      requestRender()
      return
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
      values: new Float32Array(stValues),
    })

    const geometry = new Geometry({
      attributes,
      indices: orderedGlobalVertices.length > 65535 ? new Uint32Array(indexValues) : new Uint16Array(indexValues),
      primitiveType: PrimitiveType.TRIANGLES,
      boundingSphere: BoundingSphere.fromVertices(positionValues),
    })

    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry,
      }),
      appearance: createWaterAppearance(visualWaveTimeS, isAnimatingRef.current ? 1.0 : 0.0),
      asynchronous: false,
      allowPicking: false,
      show: true,
    })

    v.scene.primitives.add(primitive)
    waterPrimitiveRef.current = primitive
    requestRender()
  }

  const stopAnimation = () => {
    setRainEnabled(false)
    isAnimatingRef.current = false
    setIsAnimating(false)
  }

  const startAnimation = () => {
    if (!meshFrames || meshFrames.frames.length < 2) return

    const startT = meshFrames.frames[0].time
    const endT = meshFrames.frames[meshFrames.frames.length - 1].time

    if (currentTimeSRef.current >= endT) {
      currentTimeSRef.current = startT
      setCurrentFrame(0)
      setCurrentTimeS(startT)
    }

    setRainEnabled(true)
    isAnimatingRef.current = true
    setIsAnimating(true)
  }

  const jumpToFrame = (index: number) => {
    if (!meshFrames) return

    stopAnimation()

    const clamped = Math.max(0, Math.min(meshFrames.frames.length - 1, index))
    const t = meshFrames.frames[clamped].time

    currentTimeSRef.current = t
    setCurrentFrame(clamped)
    setCurrentTimeS(t)
  }

  useEffect(() => {
    loadData().catch(error => {
      console.error('La Rochelle data loading error:', error)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!meshFrames || meshFrames.frames.length === 0) return

    const startT = meshFrames.frames[0].time
    currentTimeSRef.current = startT
    setCurrentTimeS(startT)
    setCurrentFrame(0)
  }, [meshFrames])

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
          shadows: true,
          requestRenderMode: false,
          maximumRenderTimeChange: 0,
          shouldAnimate: false,
        })

        viewer.current = v

        v.imageryLayers.removeAll()
        v.imageryLayers.addImageryProvider(await IonImageryProvider.fromAssetId(2))

        v.clock.currentTime = JulianDate.fromIso8601(DAYLIGHT_TIME_ISO)
        v.clock.shouldAnimate = false
        v.clock.multiplier = 0

        v.scene.logarithmicDepthBuffer = true
        v.scene.globe.depthTestAgainstTerrain = true
        v.scene.globe.enableLighting = true
        v.scene.globe.dynamicAtmosphereLighting = true
        v.scene.globe.dynamicAtmosphereLightingFromSun = true
        v.scene.globe.showGroundAtmosphere = true
        v.scene.highDynamicRange = true
        v.scene.postProcessStages.fxaa.enabled = true
        v.scene.screenSpaceCameraController.minimumZoomDistance = 2
        v.scene.screenSpaceCameraController.maximumZoomDistance = 22000
        v.shadows = true
        v.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5)

        createRainStage(metadata.center.lon, metadata.center.lat, 0, 0, 0)

        try {
          const buildings = await createOsmBuildingsAsync({
            style: new Cesium3DTileStyle({
              color: "color('#ffffff', 1.0)",
            }),
          })

          buildingsTilesetRef.current = buildings
          buildings.shadows = ShadowMode.ENABLED
          buildings.maximumScreenSpaceError = 6

          buildings.tileVisible.addEventListener((tile: any) => {
            const content = tile?.content
            const featuresLength = Number(content?.featuresLength) || 0

            for (let i = 0; i < featuresLength; i += 1) {
              const feature = content.getFeature(i) as Cesium3DTileFeature
              const key = getFeatureKey(feature)

              if (!key) continue

              visibleBuildingFeaturesRef.current.set(key, feature)
              applyColorToFeature(feature)
            }
          })

          buildings.tileUnload.addEventListener((tile: any) => {
            const content = tile?.content
            const featuresLength = Number(content?.featuresLength) || 0

            for (let i = 0; i < featuresLength; i += 1) {
              const feature = content.getFeature(i) as Cesium3DTileFeature
              const key = getFeatureKey(feature)

              if (!key) continue

              const current = visibleBuildingFeaturesRef.current.get(key)

              if (current === feature) {
                visibleBuildingFeaturesRef.current.delete(key)
              }
            }
          })

          v.scene.primitives.add(buildings)

          handler.current = new ScreenSpaceEventHandler(v.scene.canvas)

          handler.current.setInputAction((movement: any) => {
            const picked = v.scene.pick(movement.endPosition)
            v.scene.canvas.style.cursor = defined(picked) && picked instanceof Cesium3DTileFeature ? 'pointer' : 'default'
          }, ScreenSpaceEventType.MOUSE_MOVE)

          handler.current.setInputAction((click: any) => {
            const picked = v.scene.pick(click.position)

            resetSelectedBuilding()

            if (defined(picked) && picked instanceof Cesium3DTileFeature) {
              selectedBuilding.current = picked
              selectedBuildingKeyRef.current = getFeatureKey(picked)
              picked.color = Color.clone(SELECTED_BUILDING_COLOR, new Color())

              const name = picked.getProperty('name') || picked.getProperty('addr:housename') || 'Bâtiment'
              const rawHeight = picked.getProperty('cesium#estimatedHeight') || picked.getProperty('height')
              const height = rawHeight ? `${parseFloat(rawHeight).toFixed(1)}m` : 'N/A'
              const type = picked.getProperty('building') || 'N/A'
              const street = picked.getProperty('addr:street') || ''
              const number = picked.getProperty('addr:housenumber') || ''

              setBuildingInfo({
                name,
                height,
                type,
                address: street ? `${number} ${street}`.trim() : 'N/A',
                flooded: isFeatureFlooded(picked),
              })

              requestRender()
            } else {
              setBuildingInfo(null)
            }
          }, ScreenSpaceEventType.LEFT_CLICK)
        } catch (error) {
          console.warn('OSM buildings error:', error)
        }

        v.camera.flyTo({
          destination: Cartesian3.fromDegrees(metadata.center.lon, metadata.center.lat - 0.025, 5200),
          orientation: {
            heading: CesiumMath.toRadians(0),
            pitch: CesiumMath.toRadians(-42),
            roll: 0,
          },
          duration: 2.5,
        })

        setViewerReady(true)
      } catch (error) {
        console.error('Cesium init error:', error)
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

      handler.current?.destroy()
      handler.current = null

      visibleBuildingFeaturesRef.current.clear()
      currentFloodedTrianglesRef.current = []
      resetSelectedBuilding()
      clearWaterPrimitive()
      clearRainStage()

      if (viewer.current) {
        viewer.current.destroy()
        viewer.current = null
      }

      buildingsTilesetRef.current = null
    }
  }, [metadata])

  useEffect(() => {
    if (!viewerReady || !dataReady || !topology) return

    computeAutoVerticalOffset()
      .catch(error => {
        console.warn('Vertical calibration error:', error)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [viewerReady, dataReady, topology])

  useEffect(() => {
    if (!viewerReady || !topology || !meshFrames) return

    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current)
      loopRef.current = null
    }

    lastFrameTsRef.current = null
    lastRenderTsRef.current = 0

    const tick = (ts: number) => {
      if (!viewer.current || !topology || !meshFrames) return

      if (lastFrameTsRef.current == null) {
        lastFrameTsRef.current = ts
      }

      const dtS = (ts - lastFrameTsRef.current) / 1000
      lastFrameTsRef.current = ts
      waveTimeSRef.current += dtS

      if (isAnimatingRef.current) {
        const endT = meshFrames.frames[meshFrames.frames.length - 1].time
        const nextTime = currentTimeSRef.current + dtS * playbackSpeedRef.current
        currentTimeSRef.current = Math.min(nextTime, endT)

        if (currentTimeSRef.current >= endT) {
          setRainEnabled(false)
          isAnimatingRef.current = false
          setIsAnimating(false)
        }
      }

      if (ts - lastRenderTsRef.current >= TARGET_RENDER_INTERVAL_MS) {
        const timeS = currentTimeSRef.current
        const waveT = waveTimeSRef.current

        renderInterpolatedMeshAtTime(timeS, waveT)
        setCurrentTimeS(timeS)

        const pair = getFramePairAtTime(meshFrames.frames, timeS)
        if (pair) {
          setCurrentFrame(pair.indexA)
        }

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
  }, [viewerReady, topology, meshFrames, effectiveVerticalOffsetM])

  const activeColor =
    currentFrame < peakFrameIndex * 0.35 ? '#378ADD' :
    currentFrame < peakFrameIndex * 0.75 ? '#EF9F27' :
    currentFrame < peakFrameIndex ? '#E8593C' :
    '#E24B4A'

  const timeLabel = currentPair ? `${Math.round(currentPair.frameA.time / 3600)} h` : '—'

  return (
    <>
      <div ref={cesiumContainer} className="map3d-container" />

      <button className="scene-back-btn" onClick={onBack} type="button">
        ← Retour
      </button>

      {isLoading && (
        <div className="map3d-loading">Chargement de La Rochelle...</div>
      )}

      <div className={`sim-dock ${panelCollapsed ? 'collapsed' : ''}`}>
        <div className="sim-dock-header">
          <div className="sim-dock-headings">
            <span className="sim-dock-kicker">Simulation 3D</span>
            <div className="sim-dock-title">La Rochelle Xynthia</div>
            <div className="sim-dock-status">
              {dataReady ? 'NetCDF converti prêt' : 'Chargement des données'}
            </div>
          </div>

          <div className="sim-dock-header-actions">
            <button className={`sim-ghost-btn ${showAdvanced ? 'active' : ''}`} onClick={() => setShowAdvanced(v => !v)} type="button">
              Réglages
            </button>

            <button className="sim-icon-btn" onClick={() => setPanelCollapsed(v => !v)} type="button" aria-label={panelCollapsed ? 'Déployer le panneau' : 'Réduire le panneau'}>
              {panelCollapsed ? '+' : '−'}
            </button>
          </div>
        </div>

        {panelCollapsed ? (
          <div className="sim-dock-mini">
            <button className={`sim-primary-btn compact ${isAnimating ? 'stop' : ''}`} onClick={() => { isAnimating ? stopAnimation() : startAnimation() }} disabled={!meshFrames} type="button">
              {!meshFrames ? '…' : isAnimating ? 'Pause' : 'Lecture'}
            </button>

            <div className="sim-mini-stat">
              <strong style={{ color: activeColor }}>
                {interpolatedFloodedTriangles.toLocaleString('fr-FR')}
              </strong>
              <span>triangles</span>
            </div>
          </div>
        ) : (
          <div className="sim-dock-body">
            <div className="sim-hero-card" style={{ borderColor: activeColor }}>
              <div className="sim-hero-top">
                <span className="sim-hero-label">Surface inondée active</span>
                <span className="sim-hero-badge">Frame {currentFrame + 1}</span>
              </div>

              <div className="sim-hero-value" style={{ color: activeColor }}>
                {interpolatedFloodedTriangles.toLocaleString('fr-FR')}
              </div>

              <div className="sim-hero-date">
                {timeLabel}
              </div>
            </div>

            <div className="sim-main-actions">
              <button className={`sim-primary-btn ${isAnimating ? 'stop' : ''}`} onClick={() => { isAnimating ? stopAnimation() : startAnimation() }} disabled={!meshFrames} type="button">
                {!meshFrames ? 'Chargement…' : isAnimating ? 'Pause simulation' : 'Lancer simulation'}
              </button>
            </div>

            <div className="sim-timeline">
              <div className="sim-timeline-head">
                <span>{currentFrame + 1} / {totalFrames || 0}</span>
                <span>{progressPercent.toFixed(0)}%</span>
              </div>

              <input type="range" min={0} max={Math.max(totalFrames - 1, 0)} step={1} value={currentFrame} onChange={e => jumpToFrame(parseInt(e.target.value, 10))} className="sim-range" />
            </div>

            <div className="sim-jumps">
              <button className="sim-chip" onClick={() => jumpToFrame(0)} type="button">Début</button>
              <button className="sim-chip" onClick={() => jumpToFrame(Math.floor(Math.max(totalFrames - 1, 0) * 0.35))} type="button">Montée</button>
              <button className={`sim-chip ${currentFrame === peakFrameIndex ? 'active' : ''}`} onClick={() => jumpToFrame(peakFrameIndex)} type="button">Pic</button>
              <button className="sim-chip" onClick={() => jumpToFrame(Math.max(totalFrames - 1, 0))} type="button">Fin</button>
            </div>

            {showAdvanced && (
              <div className="sim-advanced">
                <div className="sim-control">
                  <div className="sim-control-head">
                    <span className="sim-control-label">Vitesse</span>
                    <span className="sim-control-value">{playbackSpeed.toFixed(0)}x</span>
                  </div>
                  <input type="range" min={1} max={3600} step={1} value={playbackSpeed} onChange={e => setPlaybackSpeed(parseFloat(e.target.value))} className="sim-range" />
                </div>

                <div className="sim-control">
                  <div className="sim-control-head">
                    <span className="sim-control-label">Offset vertical</span>
                    <span className="sim-control-value">{userVerticalOffsetM.toFixed(1)} m</span>
                  </div>
                  <input type="range" min={-20} max={20} step={0.1} value={userVerticalOffsetM} onChange={e => setUserVerticalOffsetM(parseFloat(e.target.value))} className="sim-range" />
                </div>

                <div className="sim-note-grid">
                  <div className="sim-note">
                    <span>Auto</span>
                    <strong>{autoVerticalOffsetM.toFixed(2)} m</strong>
                  </div>
                  <div className="sim-note">
                    <span>Effectif</span>
                    <strong>{effectiveVerticalOffsetM.toFixed(2)} m</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {buildingInfo && (
        <div className="building-panel">
          <div className="building-panel-header">
            <span className="building-panel-title">{buildingInfo.name}</span>
            <button className="building-panel-close" onClick={() => { resetSelectedBuilding(); setBuildingInfo(null) }} type="button">
              ✕
            </button>
          </div>

          <div className="building-rows">
            <div className="building-row">
              <span className="building-label">Type</span>
              <span className="building-value">{buildingInfo.type}</span>
            </div>
            <div className="building-row">
              <span className="building-label">Hauteur</span>
              <span className="building-value">{buildingInfo.height}</span>
            </div>
            <div className="building-row">
              <span className="building-label">Adresse</span>
              <span className="building-value">{buildingInfo.address}</span>
            </div>
            <div className="building-row">
              <span className="building-label">Inondé</span>
              <span className="building-value" style={{ color: buildingInfo.flooded ? '#c97964' : '#809c79' }}>
                {buildingInfo.flooded ? 'Oui' : 'Non'}
              </span>
            </div>
          </div>

          <div className="building-footer">Source : OpenStreetMap</div>
        </div>
      )}
    </>
  )
}
