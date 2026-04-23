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
  BillboardCollection,
  NearFarScalar,
  VerticalOrigin,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D/Map3D.css'

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

const TOPOLOGY_URL = '/data/mesh/water_mesh_topology.json'
const MESH_FRAMES_URL = '/data/mesh/water_mesh_frames.json'
const METADATA_URL = '/data/flood_metadata.json'

const TARGET_RENDER_INTERVAL_MS = 70
const DEFAULT_PLAYBACK_SPEED = 240
const WATER_SURFACE_LIFT_M = 0.04
const MIN_ACTIVE_TRIANGLE_DEPTH_M = 0.01
const VISUAL_WAVE_TIME_SCALE = 1.0
const DAYLIGHT_TIME_ISO = '2025-07-01T12:00:00Z'

const WAVE_1_AMPLITUDE_M = 0.25
const WAVE_1_LENGTH_M = 42
const WAVE_1_SPEED_MPS = 1.4
const WAVE_1_DIR_X = 1.0
const WAVE_1_DIR_Y = 0.2

const WAVE_2_AMPLITUDE_M = 0.1
const WAVE_2_LENGTH_M = 18
const WAVE_2_SPEED_MPS = 0.9
const WAVE_2_DIR_X = -0.35
const WAVE_2_DIR_Y = 1.0

const WAVE_3_AMPLITUDE_M = 0.7
const WAVE_3_LENGTH_M = 8
const WAVE_3_SPEED_MPS = 1.8
const WAVE_3_DIR_X = 0.7
const WAVE_3_DIR_Y = 0.7

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

const TREE_COUNT = 220

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

interface FloodMetadata {
  project: string
  source_crs: string
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
  n_cells: number
  terrain_elev_range: {
    min: number
    max: number
  }
  wse_range: {
    min: number
    max: number
  }
  simulation_start: string
  simulation_end: string
  units: string
}

interface MeshTopology {
  version: number
  project?: string
  crs: string
  units: string
  source_units?: string
  vertex_count: number
  triangle_count: number
  cell_count: number
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
  vertex_terrain_m: number[]
  triangles: number[][]
  triangle_cell_ids: number[]
  vertex_local_x_m?: number[]
  vertex_local_y_m?: number[]
}

interface MeshFrame {
  t: number
  ts: string
  n_flooded: number
  wet_cell_ids: number[]
  wet_cell_wse_m: number[]
  wet_cell_depth_m: number[]
  wet_vertex_ids: number[]
  wet_vertex_heights_m: number[]
  active_triangle_ids: number[]
}

interface MeshFramesFile {
  version: number
  units: string
  frame_count: number
  frames: MeshFrame[]
}

interface FramePair {
  indexA: number
  indexB: number
  frameA: MeshFrame
  frameB: MeshFrame
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

function createSeededRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createTreeSpriteDataUrl() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.clearRect(0, 0, 128, 128)

  const shadow = ctx.createRadialGradient(64, 102, 8, 64, 102, 34)
  shadow.addColorStop(0, 'rgba(0,0,0,0.26)')
  shadow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.ellipse(64, 102, 30, 11, 0, 0, Math.PI * 2)
  ctx.fill()

  const trunk = ctx.createLinearGradient(60, 58, 68, 102)
  trunk.addColorStop(0, '#7a5335')
  trunk.addColorStop(1, '#4b311f')
  ctx.fillStyle = trunk
  ctx.fillRect(58, 66, 12, 32)

  const crownA = ctx.createRadialGradient(45, 50, 8, 45, 50, 34)
  crownA.addColorStop(0, '#b7db7a')
  crownA.addColorStop(1, '#5f9445')
  ctx.fillStyle = crownA
  ctx.beginPath()
  ctx.arc(45, 50, 25, 0, Math.PI * 2)
  ctx.fill()

  const crownB = ctx.createRadialGradient(78, 46, 8, 78, 46, 30)
  crownB.addColorStop(0, '#b7db7a')
  crownB.addColorStop(1, '#588a40')
  ctx.fillStyle = crownB
  ctx.beginPath()
  ctx.arc(78, 46, 23, 0, Math.PI * 2)
  ctx.fill()

  const crownC = ctx.createRadialGradient(64, 34, 8, 64, 34, 28)
  crownC.addColorStop(0, '#cde999')
  crownC.addColorStop(1, '#67984c')
  ctx.fillStyle = crownC
  ctx.beginPath()
  ctx.arc(64, 34, 24, 0, Math.PI * 2)
  ctx.fill()

  return canvas.toDataURL('image/png')
}

function getFramePairAtTime(frames: MeshFrame[], timeH: number): FramePair | null {
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

function buildHeightMap(frame: MeshFrame) {
  const map = new Map<number, number>()

  for (let i = 0; i < frame.wet_vertex_ids.length; i += 1) {
    map.set(frame.wet_vertex_ids[i], frame.wet_vertex_heights_m[i])
  }

  return map
}

function buildTriangleSet(frameA: MeshFrame, frameB: MeshFrame) {
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

function degreesToLocalMeters(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number
) {
  const metersPerDegLat = 111320
  const metersPerDegLon = Math.cos((centerLat * Math.PI) / 180) * 111320

  return {
    x: (lon - centerLon) * metersPerDegLon,
    y: (lat - centerLat) * metersPerDegLat,
  }
}

function waveComponent(
  x: number,
  y: number,
  timeS: number,
  amplitudeM: number,
  wavelengthM: number,
  speedMps: number,
  dirX: number,
  dirY: number
) {
  const dir = normalize2D(dirX, dirY)
  const k = (2 * Math.PI) / wavelengthM
  const phase = k * (dir.x * x + dir.y * y - speedMps * timeS)
  return amplitudeM * Math.sin(phase)
}

function computeWaveOffsetMeters(
  x: number,
  y: number,
  timeS: number,
  depthM: number
) {
  const depthFactor = Math.max(0, Math.min(1, (depthM - 0.05) / 0.8))

  const swell =
    waveComponent(
      x,
      y,
      timeS,
      WAVE_1_AMPLITUDE_M,
      WAVE_1_LENGTH_M,
      WAVE_1_SPEED_MPS,
      WAVE_1_DIR_X,
      WAVE_1_DIR_Y
    ) +
    waveComponent(
      x,
      y,
      timeS,
      WAVE_2_AMPLITUDE_M,
      WAVE_2_LENGTH_M,
      WAVE_2_SPEED_MPS,
      WAVE_2_DIR_X,
      WAVE_2_DIR_Y
    ) +
    waveComponent(
      x,
      y,
      timeS,
      WAVE_3_AMPLITUDE_M,
      WAVE_3_LENGTH_M,
      WAVE_3_SPEED_MPS,
      WAVE_3_DIR_X,
      WAVE_3_DIR_Y
    )

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
      type: 'FloodRippleWater',
      uniforms: {
        baseWaterColor: new Color(0.06, 0.3, 0.55, 0.34),
        blendColor: new Color(0.06, 0.3, 0.55, 0.14),
        normalMap: buildModuleUrl('Assets/Textures/waterNormalsSmall.jpg'),
        time: timeS,
        rainAmount,
        amplitude: 0.03,
        specularIntensity: 0.55,
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

function pointSign(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by)
}

function pointInTriangle2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
) {
  const d1 = pointSign(px, py, ax, ay, bx, by)
  const d2 = pointSign(px, py, bx, by, cx, cy)
  const d3 = pointSign(px, py, cx, cy, ax, ay)

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0

  return !(hasNeg && hasPos)
}

function getVertexLocalXY(topology: MeshTopology, vertexIndex: number) {
  const lonlat = topology.vertices_lonlat[vertexIndex]

  const x =
    topology.vertex_local_x_m?.[vertexIndex] ??
    degreesToLocalMeters(
      lonlat[0],
      lonlat[1],
      topology.center.lon,
      topology.center.lat
    ).x

  const y =
    topology.vertex_local_y_m?.[vertexIndex] ??
    degreesToLocalMeters(
      lonlat[0],
      lonlat[1],
      topology.center.lon,
      topology.center.lat
    ).y

  return { x, y }
}

function buildFloodedTriangles(
  topology: MeshTopology,
  pair: FramePair,
  heightMapA: Map<number, number>,
  heightMapB: Map<number, number>,
  activeTriangleIds: number[]
) {
  const floodedTriangles: FloodedTriangle[] = []

  for (const triId of activeTriangleIds) {
    const tri = topology.triangles[triId]
    if (!tri || tri.length !== 3) continue

    const v0 = tri[0]
    const v1 = tri[1]
    const v2 = tri[2]

    const terrain0 = topology.vertex_terrain_m[v0] ?? 0
    const terrain1 = topology.vertex_terrain_m[v1] ?? 0
    const terrain2 = topology.vertex_terrain_m[v2] ?? 0

    const hA0 = heightMapA.has(v0) ? Number(heightMapA.get(v0)) : terrain0
    const hA1 = heightMapA.has(v1) ? Number(heightMapA.get(v1)) : terrain1
    const hA2 = heightMapA.has(v2) ? Number(heightMapA.get(v2)) : terrain2

    const hB0 = heightMapB.has(v0) ? Number(heightMapB.get(v0)) : terrain0
    const hB1 = heightMapB.has(v1) ? Number(heightMapB.get(v1)) : terrain1
    const hB2 = heightMapB.has(v2) ? Number(heightMapB.get(v2)) : terrain2

    const depth0 = Math.max(0, lerp(hA0, hB0, pair.alpha) - terrain0)
    const depth1 = Math.max(0, lerp(hA1, hB1, pair.alpha) - terrain1)
    const depth2 = Math.max(0, lerp(hA2, hB2, pair.alpha) - terrain2)

    const avgDepth = (depth0 + depth1 + depth2) / 3

    if (avgDepth <= MIN_ACTIVE_TRIANGLE_DEPTH_M) continue

    const p0 = getVertexLocalXY(topology, v0)
    const p1 = getVertexLocalXY(topology, v1)
    const p2 = getVertexLocalXY(topology, v2)

    floodedTriangles.push({
      ax: p0.x,
      ay: p0.y,
      bx: p1.x,
      by: p1.y,
      cx: p2.x,
      cy: p2.y,
      minX: Math.min(p0.x, p1.x, p2.x),
      minY: Math.min(p0.y, p1.y, p2.y),
      maxX: Math.max(p0.x, p1.x, p2.x),
      maxY: Math.max(p0.y, p1.y, p2.y),
    })
  }

  return floodedTriangles
}

export default function MuncieFloodView({ onBack }: Props) {
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
  const treeBillboardsRef = useRef<BillboardCollection | null>(null)

  const loopRef = useRef<number | null>(null)
  const lastFrameTsRef = useRef<number | null>(null)
  const lastRenderTsRef = useRef<number>(0)

  const currentTimeHRef = useRef(0)
  const playbackSpeedRef = useRef(DEFAULT_PLAYBACK_SPEED)
  const isAnimatingRef = useRef(false)
  const waveTimeSRef = useRef(0)

  const [topology, setTopology] = useState<MeshTopology | null>(null)
  const [meshFrames, setMeshFrames] = useState<MeshFramesFile | null>(null)
  const [metadata, setMetadata] = useState<FloodMetadata | null>(null)

  const [viewerReady, setViewerReady] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [currentFrame, setCurrentFrame] = useState(0)
  const [currentTimeH, setCurrentTimeH] = useState(0)
  const [waveTimeS, setWaveTimeS] = useState(0)
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
    return getFramePairAtTime(meshFrames.frames, currentTimeH)
  }, [meshFrames, currentTimeH])

  const interpolatedFloodedCells = useMemo(() => {
    if (!currentPair) return 0
    return Math.round(
      lerp(currentPair.frameA.n_flooded, currentPair.frameB.n_flooded, currentPair.alpha)
    )
  }, [currentPair])

  const peakFrameIndex = useMemo(() => {
    if (!meshFrames) return 0

    let bestIndex = 0
    let bestValue = -1

    for (let i = 0; i < meshFrames.frames.length; i += 1) {
      const value = meshFrames.frames[i].n_flooded
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
    currentTimeHRef.current = currentTimeH
  }, [currentTimeH])

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
    const key =
      getFeatureKey(feature) ||
      String(feature.getProperty('name') || feature.getProperty('building') || '')

    const rawHeight = Number(
      feature.getProperty('cesium#estimatedHeight') ||
      feature.getProperty('height') ||
      12
    )

    const buildingType = String(feature.getProperty('building') || '').toLowerCase()
    const jitter = hashStringToUnit(key)
    const heightMix = clamp01(Number.isFinite(rawHeight) ? rawHeight / 80 : 0.2)

    let base = BUILDING_LIGHT

    if (
      buildingType.includes('industrial') ||
      buildingType.includes('warehouse') ||
      buildingType.includes('commercial') ||
      buildingType.includes('retail') ||
      buildingType.includes('supermarket')
    ) {
      base = BUILDING_INDUS
    } else if (
      buildingType.includes('apartments') ||
      buildingType.includes('residential') ||
      buildingType.includes('house') ||
      buildingType.includes('detached') ||
      buildingType.includes('terrace')
    ) {
      base = BUILDING_RESIDENTIAL
    } else if (
      buildingType.includes('office') ||
      buildingType.includes('hotel') ||
      rawHeight > 45
    ) {
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
    if (!topology) return false

    const lon = Number(feature.getProperty('cesium#longitude'))
    const lat = Number(feature.getProperty('cesium#latitude'))

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return false
    }

    if (
      lon < topology.bbox.lon_min ||
      lon > topology.bbox.lon_max ||
      lat < topology.bbox.lat_min ||
      lat > topology.bbox.lat_max
    ) {
      return false
    }

    const local = degreesToLocalMeters(
      lon,
      lat,
      topology.center.lon,
      topology.center.lat
    )

    const floodedTriangles = currentFloodedTrianglesRef.current

    for (let i = 0; i < floodedTriangles.length; i += 1) {
      const tri = floodedTriangles[i]

      if (
        local.x < tri.minX ||
        local.x > tri.maxX ||
        local.y < tri.minY ||
        local.y > tri.maxY
      ) {
        continue
      }

      if (
        pointInTriangle2D(
          local.x,
          local.y,
          tri.ax,
          tri.ay,
          tri.bx,
          tri.by,
          tri.cx,
          tri.cy
        )
      ) {
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

    feature.color = isFeatureFlooded(feature)
      ? Color.clone(FLOODED_BUILDING_COLOR, new Color())
      : getBaseBuildingColor(feature)
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

  const clearTreeBillboards = () => {
    const v = viewer.current
    const trees = treeBillboardsRef.current

    if (!v || !trees) return

    v.scene.primitives.remove(trees)

    if (!trees.isDestroyed()) {
      trees.destroy()
    }

    treeBillboardsRef.current = null
    requestRender()
  }

  const setRainEnabled = (enabled: boolean) => {
    const stage = rainStageRef.current
    if (!stage) return
    stage.enabled = enabled
    requestRender()
  }

  const createDecorativeTrees = async () => {
    const v = viewer.current
    if (!v || !metadata) return

    clearTreeBillboards()

    const sprite = createTreeSpriteDataUrl()
    const rng = createSeededRandom(183745)
    const points: Cartographic[] = []

    const lonPad = (metadata.bbox.lon_max - metadata.bbox.lon_min) * 0.06
    const latPad = (metadata.bbox.lat_max - metadata.bbox.lat_min) * 0.06

    for (let i = 0; i < TREE_COUNT; i += 1) {
      const lon = lerp(
        metadata.bbox.lon_min + lonPad,
        metadata.bbox.lon_max - lonPad,
        rng()
      )
      const lat = lerp(
        metadata.bbox.lat_min + latPad,
        metadata.bbox.lat_max - latPad,
        rng()
      )

      points.push(Cartographic.fromDegrees(lon, lat))
    }

    const sampled = await sampleTerrainMostDetailed(v.terrainProvider, points)
    const trees = new BillboardCollection({
      scene: v.scene,
    })

    const greenA = Color.fromCssColorString('#6c9547')
    const greenB = Color.fromCssColorString('#88ad55')
    const greenC = Color.fromCssColorString('#5f8543')

    for (let i = 0; i < sampled.length; i += 1) {
      const carto = sampled[i]
      if (!Number.isFinite(carto.height)) continue

      const colorMix = rng()
      const baseTint = Color.lerp(
        colorMix < 0.5 ? greenA : greenB,
        greenC,
        rng() * 0.45,
        new Color()
      )
      baseTint.alpha = 0.98

      const height = 28 + rng() * 22
      const width = height * (0.58 + rng() * 0.18)

      trees.add({
        position: Cartesian3.fromRadians(
          carto.longitude,
          carto.latitude,
          carto.height + 0.05
        ),
        image: sprite,
        width,
        height,
        color: baseTint,
        verticalOrigin: VerticalOrigin.BOTTOM,
        scaleByDistance: new NearFarScalar(250, 1.15, 8000, 0.32),
        translucencyByDistance: new NearFarScalar(4000, 1.0, 16000, 0.18),
      })
    }

    v.scene.primitives.add(trees)
    treeBillboardsRef.current = trees
    requestRender()
  }

  const createRainStage = (
    centerLon: number,
    centerLat: number,
    effectHei = 0,
    effectDxRad = 0,
    effectDyRad = 0
  ) => {
    const v = viewer.current
    if (!v || rainStageRef.current) return

    const effectCenter = Cartesian3.fromDegrees(centerLon, centerLat, effectHei)
    const effectFrame = Transforms.eastNorthUpToFixedFrame(effectCenter)
    const inverseEffectFrame = Matrix4.inverseTransformation(effectFrame, new Matrix4())

    const computeRainState = () => {
      const cam = v.camera

      const rightLocal = Matrix4.multiplyByPointAsVector(
        inverseEffectFrame,
        cam.right,
        new Cartesian3()
      )
      const upLocal = Matrix4.multiplyByPointAsVector(
        inverseEffectFrame,
        cam.up,
        new Cartesian3()
      )
      const dirLocal = Matrix4.multiplyByPointAsVector(
        inverseEffectFrame,
        cam.direction,
        new Cartesian3()
      )
      const posLocal = Matrix4.multiplyByPoint(
        inverseEffectFrame,
        cam.position,
        new Cartesian3()
      )

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
      name: 'muncie-rain-shader',
      fragmentShader,
      uniforms: {
        rainPars0: () => {
          const s = computeRainState()
          return new Cartesian4(
            s.height,
            s.rightLocal.x,
            s.rightLocal.y,
            s.rightLocal.z
          )
        },
        rainPars1: () => {
          const s = computeRainState()
          return new Cartesian4(
            s.upLocal.x,
            s.upLocal.y,
            s.upLocal.z,
            s.dirLocal.x
          )
        },
        rainPars2: () => {
          const s = computeRainState()
          return new Cartesian4(
            s.dirLocal.y,
            s.dirLocal.z,
            s.posLocal.x,
            s.posLocal.y
          )
        },
        rainPars3: () => {
          const s = computeRainState()
          return new Cartesian4(
            s.posLocal.z,
            effectHei,
            effectDxRad,
            effectDyRad
          )
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

    if (!topologyResponse.ok) {
      throw new Error(`Failed to load ${TOPOLOGY_URL}`)
    }

    if (!framesResponse.ok) {
      throw new Error(`Failed to load ${MESH_FRAMES_URL}`)
    }

    if (!metadataResponse.ok) {
      throw new Error(`Failed to load ${METADATA_URL}`)
    }

    const topologyJson = (await topologyResponse.json()) as MeshTopology
    const framesJson = (await framesResponse.json()) as MeshFramesFile
    const metadataJson = (await metadataResponse.json()) as FloodMetadata

    const centerLon = topologyJson.center.lon
    const centerLat = topologyJson.center.lat

    const vertexLocalXM: number[] = []
    const vertexLocalYM: number[] = []

    for (const lonlat of topologyJson.vertices_lonlat) {
      const local = degreesToLocalMeters(lonlat[0], lonlat[1], centerLon, centerLat)
      vertexLocalXM.push(local.x)
      vertexLocalYM.push(local.y)
    }

    setTopology({
      ...topologyJson,
      vertex_local_x_m: vertexLocalXM,
      vertex_local_y_m: vertexLocalYM,
    })
    setMeshFrames(framesJson)
    setMetadata(metadataJson)
    setDataReady(true)
  }

  const computeAutoVerticalOffset = async () => {
    const v = viewer.current

    if (!v || !topology || topology.vertices_lonlat.length === 0) return

    const sampleCount = Math.min(180, topology.vertices_lonlat.length)
    const step = Math.max(1, Math.floor(topology.vertices_lonlat.length / sampleCount))
    const cartographics: Cartographic[] = []
    const sourceHeights: number[] = []

    for (let i = 0; i < topology.vertices_lonlat.length && cartographics.length < sampleCount; i += step) {
      const lonlat = topology.vertices_lonlat[i]
      const terrainM = topology.vertex_terrain_m[i]

      if (!lonlat || lonlat.length < 2) continue
      if (!Number.isFinite(terrainM)) continue

      cartographics.push(Cartographic.fromDegrees(lonlat[0], lonlat[1]))
      sourceHeights.push(terrainM)
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

  const renderInterpolatedMeshAtTime = (timeH: number, visualWaveTimeS: number) => {
    const v = viewer.current

    if (!v || !topology || !meshFrames) return

    const pair = getFramePairAtTime(meshFrames.frames, timeH)
    if (!pair) return

    clearWaterPrimitive()

    const heightMapA = buildHeightMap(pair.frameA)
    const heightMapB = buildHeightMap(pair.frameB)
    const activeTriangleIds = buildTriangleSet(pair.frameA, pair.frameB)
    const floodedTriangles = buildFloodedTriangles(
      topology,
      pair,
      heightMapA,
      heightMapB,
      activeTriangleIds
    )

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

    const lonMin = topology.bbox.lon_min
    const lonMax = topology.bbox.lon_max
    const latMin = topology.bbox.lat_min
    const latMax = topology.bbox.lat_max
    const lonSpan = Math.max(1e-9, lonMax - lonMin)
    const latSpan = Math.max(1e-9, latMax - latMin)

    for (let localIndex = 0; localIndex < orderedGlobalVertices.length; localIndex += 1) {
      const globalIndex = orderedGlobalVertices[localIndex]
      const lonlat = topology.vertices_lonlat[globalIndex]
      const terrainM = topology.vertex_terrain_m[globalIndex] ?? 0

      const hA = heightMapA.has(globalIndex) ? Number(heightMapA.get(globalIndex)) : terrainM
      const hB = heightMapB.has(globalIndex) ? Number(heightMapB.get(globalIndex)) : terrainM
      const waterHeightM = lerp(hA, hB, pair.alpha)

      const depthM = Math.max(0, waterHeightM - terrainM)

      const localX =
        topology.vertex_local_x_m?.[globalIndex] ??
        degreesToLocalMeters(
          lonlat[0],
          lonlat[1],
          topology.center.lon,
          topology.center.lat
        ).x

      const localY =
        topology.vertex_local_y_m?.[globalIndex] ??
        degreesToLocalMeters(
          lonlat[0],
          lonlat[1],
          topology.center.lon,
          topology.center.lat
        ).y

      const waveOffsetM = computeWaveOffsetMeters(
        localX,
        localY,
        visualWaveTimeS * VISUAL_WAVE_TIME_SCALE,
        depthM
      )

      const finalHeightM =
        waterHeightM +
        effectiveVerticalOffsetM +
        WATER_SURFACE_LIFT_M +
        waveOffsetM

      const cart = Cartesian3.fromDegrees(lonlat[0], lonlat[1], finalHeightM)
      positionValues.push(cart.x, cart.y, cart.z)

      const s = (lonlat[0] - lonMin) / lonSpan
      const t = (lonlat[1] - latMin) / latSpan
      stValues.push(s, t)

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
      indices:
        orderedGlobalVertices.length > 65535
          ? new Uint32Array(indexValues)
          : new Uint16Array(indexValues),
      primitiveType: PrimitiveType.TRIANGLES,
      boundingSphere: BoundingSphere.fromVertices(positionValues),
    })

    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry,
      }),
      appearance: createWaterAppearance(
        visualWaveTimeS,
        isAnimatingRef.current ? 1.0 : 0.0
      ),
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

    const startT = meshFrames.frames[0].t
    const endT = meshFrames.frames[meshFrames.frames.length - 1].t

    if (currentTimeHRef.current >= endT) {
      currentTimeHRef.current = startT
      setCurrentFrame(0)
      setCurrentTimeH(startT)
    }

    setRainEnabled(true)
    isAnimatingRef.current = true
    setIsAnimating(true)
  }

  const jumpToFrame = (index: number) => {
    if (!meshFrames) return

    stopAnimation()

    const clamped = Math.max(0, Math.min(meshFrames.frames.length - 1, index))
    const t = meshFrames.frames[clamped].t

    currentTimeHRef.current = t
    setCurrentFrame(clamped)
    setCurrentTimeH(t)
  }

  useEffect(() => {
    loadData().catch(error => {
      console.error('Data loading error:', error)
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
        v.scene.screenSpaceCameraController.maximumZoomDistance = 20000
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
          await createDecorativeTrees()

          handler.current = new ScreenSpaceEventHandler(v.scene.canvas)

          handler.current.setInputAction((movement: any) => {
            const picked = v.scene.pick(movement.endPosition)
            v.scene.canvas.style.cursor =
              defined(picked) && picked instanceof Cesium3DTileFeature ? 'pointer' : 'default'
          }, ScreenSpaceEventType.MOUSE_MOVE)

          handler.current.setInputAction((click: any) => {
            const picked = v.scene.pick(click.position)

            resetSelectedBuilding()

            if (defined(picked) && picked instanceof Cesium3DTileFeature) {
              selectedBuilding.current = picked
              selectedBuildingKeyRef.current = getFeatureKey(picked)
              picked.color = Color.clone(SELECTED_BUILDING_COLOR, new Color())

              const name =
                picked.getProperty('name') ||
                picked.getProperty('addr:housename') ||
                'Bâtiment'

              const rawHeight =
                picked.getProperty('cesium#estimatedHeight') ||
                picked.getProperty('height')

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
          destination: Cartesian3.fromDegrees(
            metadata.center.lon,
            metadata.center.lat - 0.01,
            2600
          ),
          orientation: {
            heading: CesiumMath.toRadians(0),
            pitch: CesiumMath.toRadians(-38),
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
      clearTreeBillboards()

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
        const endT = meshFrames.frames[meshFrames.frames.length - 1].t
        const nextTime = currentTimeHRef.current + (dtS / 3600) * playbackSpeedRef.current
        currentTimeHRef.current = Math.min(nextTime, endT)

        if (currentTimeHRef.current >= endT) {
          setRainEnabled(false)
          isAnimatingRef.current = false
          setIsAnimating(false)
        }
      }

      if (ts - lastRenderTsRef.current >= TARGET_RENDER_INTERVAL_MS) {
        const timeH = currentTimeHRef.current
        const waveT = waveTimeSRef.current

        renderInterpolatedMeshAtTime(timeH, waveT)

        setCurrentTimeH(timeH)
        setWaveTimeS(waveT)

        const pair = getFramePairAtTime(meshFrames.frames, timeH)
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

  return (
    <>
      <div ref={cesiumContainer} className="map3d-container" />

      <button className="scene-back-btn" onClick={onBack} type="button">
        ← Retour
      </button>

      {isLoading && (
        <div className="map3d-loading">Chargement de l’eau animée...</div>
      )}

      <div className={`sim-dock ${panelCollapsed ? 'collapsed' : ''}`}>
        <div className="sim-dock-header">
          <div className="sim-dock-headings">
            <span className="sim-dock-kicker">Simulation 3D</span>
            <div className="sim-dock-title">Submersion urbaine</div>
            <div className="sim-dock-status">
              {dataReady ? 'Mesh prêt' : 'Chargement des données'}
            </div>
          </div>

          <div className="sim-dock-header-actions">
            <button
              className={`sim-ghost-btn ${showAdvanced ? 'active' : ''}`}
              onClick={() => setShowAdvanced(v => !v)}
              type="button"
            >
              Réglages
            </button>

            <button
              className="sim-icon-btn"
              onClick={() => setPanelCollapsed(v => !v)}
              type="button"
              aria-label={panelCollapsed ? 'Déployer le panneau' : 'Réduire le panneau'}
            >
              {panelCollapsed ? '+' : '−'}
            </button>
          </div>
        </div>

        {panelCollapsed ? (
          <div className="sim-dock-mini">
            <button
              className={`sim-primary-btn compact ${isAnimating ? 'stop' : ''}`}
              onClick={() => {
                if (isAnimating) {
                  stopAnimation()
                } else {
                  startAnimation()
                }
              }}
              disabled={!meshFrames}
              type="button"
            >
              {!meshFrames ? '…' : isAnimating ? 'Pause' : 'Lecture'}
            </button>

            <div className="sim-mini-stat">
              <strong style={{ color: activeColor }}>
                {interpolatedFloodedCells.toLocaleString('fr-FR')}
              </strong>
              <span>cellules</span>
            </div>
          </div>
        ) : (
          <div className="sim-dock-body">
            <div className="sim-hero-card" style={{ borderColor: activeColor }}>
              <div className="sim-hero-top">
                <span className="sim-hero-label">Cellules inondées</span>
                <span className="sim-hero-badge">Frame {currentFrame + 1}</span>
              </div>

              <div className="sim-hero-value" style={{ color: activeColor }}>
                {interpolatedFloodedCells.toLocaleString('fr-FR')}
              </div>

              <div className="sim-hero-date">
                {currentPair ? currentPair.frameA.ts : '—'}
              </div>
            </div>

            <div className="sim-main-actions">
              <button
                className={`sim-primary-btn ${isAnimating ? 'stop' : ''}`}
                onClick={() => {
                  if (isAnimating) {
                    stopAnimation()
                  } else {
                    startAnimation()
                  }
                }}
                disabled={!meshFrames}
                type="button"
              >
                {!meshFrames ? 'Chargement…' : isAnimating ? 'Pause simulation' : 'Lancer simulation'}
              </button>
            </div>

            <div className="sim-timeline">
              <div className="sim-timeline-head">
                <span>{currentFrame + 1} / {totalFrames || 0}</span>
                <span>{progressPercent.toFixed(0)}%</span>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(totalFrames - 1, 0)}
                step={1}
                value={currentFrame}
                onChange={e => jumpToFrame(parseInt(e.target.value, 10))}
                className="sim-range"
              />
            </div>

            <div className="sim-jumps">
              <button className="sim-chip" onClick={() => jumpToFrame(0)} type="button">
                Début
              </button>
              <button
                className="sim-chip"
                onClick={() => jumpToFrame(Math.floor(Math.max(totalFrames - 1, 0) * 0.35))}
                type="button"
              >
                Montée
              </button>
              <button
                className={`sim-chip ${currentFrame === peakFrameIndex ? 'active' : ''}`}
                onClick={() => jumpToFrame(peakFrameIndex)}
                type="button"
              >
                Pic
              </button>
              <button
                className="sim-chip"
                onClick={() => jumpToFrame(Math.max(totalFrames - 1, 0))}
                type="button"
              >
                Fin
              </button>
            </div>

            {showAdvanced && (
              <div className="sim-advanced">
                <div className="sim-control">
                  <div className="sim-control-head">
                    <span className="sim-control-label">Vitesse</span>
                    <span className="sim-control-value">{playbackSpeed.toFixed(0)}x</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={3600}
                    step={1}
                    value={playbackSpeed}
                    onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
                    className="sim-range"
                  />
                </div>

                <div className="sim-control">
                  <div className="sim-control-head">
                    <span className="sim-control-label">Offset vertical</span>
                    <span className="sim-control-value">{userVerticalOffsetM.toFixed(1)} m</span>
                  </div>
                  <input
                    type="range"
                    min={-20}
                    max={20}
                    step={0.1}
                    value={userVerticalOffsetM}
                    onChange={e => setUserVerticalOffsetM(parseFloat(e.target.value))}
                    className="sim-range"
                  />
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
            <button
              className="building-panel-close"
              onClick={() => {
                resetSelectedBuilding()
                setBuildingInfo(null)
              }}
              type="button"
            >
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
              <span
                className="building-value"
                style={{ color: buildingInfo.flooded ? '#c97964' : '#809c79' }}
              >
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