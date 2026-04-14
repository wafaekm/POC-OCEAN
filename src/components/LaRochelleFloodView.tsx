import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  IonImageryProvider,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Color,
  Cesium3DTileFeature,
  Cesium3DTileStyle,
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
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D/Map3D.css'

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

const TOPOLOGY_URL = '/data/larochelle_xynthia/water_mesh_topology.json'
const MESH_FRAMES_URL = '/data/larochelle_xynthia/water_mesh_frames.json'
const METADATA_URL = '/data/larochelle_xynthia/flood_metadata.json'

const TARGET_RENDER_INTERVAL_MS = 70
const DEFAULT_PLAYBACK_SPEED = 180
const WATER_SURFACE_LIFT_M = 0.04
const MIN_ACTIVE_TRIANGLE_DEPTH_M = 0.01
const VISUAL_WAVE_TIME_SCALE = 1.0

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

type Props = {
  onBack: () => void
}

interface BuildingInfo {
  name: string
  height: string
  type: string
  address: string
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

function lerp(a: number, b: number, alpha: number) {
  return a + (b - a) * alpha
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

function createWaterAppearance() {
  const appearance = new EllipsoidSurfaceAppearance({
    aboveGround: false,
    translucent: true,
    faceForward: true,
  })

  appearance.material = Material.fromType('Water', {
    baseWaterColor: new Color(0.06, 0.3, 0.55, 0.3),
    blendColor: new Color(0.06, 0.3, 0.55, 0.1),
    normalMap: buildModuleUrl('Assets/Textures/waterNormalsSmall.jpg'),
    frequency: 220,
    animationSpeed: 0.02,
    amplitude: 0.02,
    specularIntensity: 0.45,
  })

  return appearance
}

function getPeakFrame(frames: MeshFrame[]) {
  if (!frames.length) return null

  let bestIndex = 0
  let bestValue = -1

  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i].n_flooded > bestValue) {
      bestValue = frames[i].n_flooded
      bestIndex = i
    }
  }

  return frames[bestIndex]
}

function computeFloodCameraPose(topology: MeshTopology, frame: MeshFrame) {
  const candidateIds = frame.wet_vertex_ids.filter((vid) => {
    const z = topology.vertex_terrain_m[vid]
    return Number.isFinite(z) && z > -0.5
  })

  const ids = candidateIds.length ? candidateIds : frame.wet_vertex_ids
  if (!ids.length) return null

  let lonMin = Number.POSITIVE_INFINITY
  let lonMax = Number.NEGATIVE_INFINITY
  let latMin = Number.POSITIVE_INFINITY
  let latMax = Number.NEGATIVE_INFINITY

  for (const vertexId of ids) {
    const lonlat = topology.vertices_lonlat[vertexId]
    if (!lonlat || lonlat.length < 2) continue

    const lon = lonlat[0]
    const lat = lonlat[1]

    if (lon < lonMin) lonMin = lon
    if (lon > lonMax) lonMax = lon
    if (lat < latMin) latMin = lat
    if (lat > latMax) latMax = lat
  }

  if (
    !Number.isFinite(lonMin) ||
    !Number.isFinite(lonMax) ||
    !Number.isFinite(latMin) ||
    !Number.isFinite(latMax)
  ) {
    return null
  }

  const padLon = Math.max(0.002, (lonMax - lonMin) * 0.2)
  const padLat = Math.max(0.002, (latMax - latMin) * 0.2)

  const minLon = lonMin - padLon
  const maxLon = lonMax + padLon
  const minLat = latMin - padLat
  const maxLat = latMax + padLat

  const centerLon = (minLon + maxLon) * 0.5
  const centerLat = (minLat + maxLat) * 0.5

  const spanLonM = (maxLon - minLon) * Math.cos((centerLat * Math.PI) / 180) * 111320
  const spanLatM = (maxLat - minLat) * 111320
  const maxSpanM = Math.max(spanLonM, spanLatM)
  const altitude = Math.max(1200, Math.min(9000, maxSpanM * 1.9))

  return {
    destination: Cartesian3.fromDegrees(centerLon, centerLat, altitude),
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(-55),
      roll: 0,
    },
  }
}

export default function LaRochelleFloodView({ onBack }: Props) {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const handler = useRef<ScreenSpaceEventHandler | null>(null)
  const selectedBuilding = useRef<Cesium3DTileFeature | null>(null)
  const selectedBuildingOriginalColor = useRef<Color | null>(null)
  const waterPrimitiveRef = useRef<Primitive | null>(null)
  const didInitialZoomRef = useRef(false)

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

  const resetSelectedBuilding = () => {
    if (!selectedBuilding.current) return

    if (selectedBuildingOriginalColor.current) {
      selectedBuilding.current.color = selectedBuildingOriginalColor.current
    } else {
      selectedBuilding.current.color = Color.WHITE
    }

    selectedBuilding.current = null
    selectedBuildingOriginalColor.current = null
    requestRender()
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

    const sampleCount = Math.min(220, topology.vertices_lonlat.length)
    const step = Math.max(1, Math.floor(topology.vertices_lonlat.length / sampleCount))
    const cartographics: Cartographic[] = []
    const sourceHeights: number[] = []

    for (
      let i = 0;
      i < topology.vertices_lonlat.length && cartographics.length < sampleCount;
      i += step
    ) {
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
      appearance: createWaterAppearance(),
      asynchronous: false,
      allowPicking: false,
      show: true,
    })

    v.scene.primitives.add(primitive)
    waterPrimitiveRef.current = primitive
    requestRender()
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
    setCurrentFrame(clamped)
    setCurrentTimeH(t)
  }

  useEffect(() => {
    loadData().catch((error) => {
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
        })

        viewer.current = v

        v.imageryLayers.removeAll()
        v.imageryLayers.addImageryProvider(await IonImageryProvider.fromAssetId(2))

        v.scene.logarithmicDepthBuffer = true
        v.scene.globe.depthTestAgainstTerrain = true
        v.scene.globe.enableLighting = true
        v.scene.globe.showGroundAtmosphere = true
        v.scene.highDynamicRange = true
        v.scene.postProcessStages.fxaa.enabled = true
        v.scene.screenSpaceCameraController.minimumZoomDistance = 2
        v.scene.screenSpaceCameraController.maximumZoomDistance = 25000
        v.shadows = true
        v.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5)

        try {
          const buildings = await createOsmBuildingsAsync({
            style: new Cesium3DTileStyle({
              color: "mix(color('#d9d4cc'), color('#f3eee8'), 0.35)",
            }),
          })

          buildings.shadows = ShadowMode.ENABLED
          buildings.maximumScreenSpaceError = 8
          v.scene.primitives.add(buildings)

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
              selectedBuildingOriginalColor.current = Color.clone(picked.color, new Color())
              picked.color = Color.fromCssColorString('#4a9eff')

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
            metadata.center.lat,
            12000
          ),
          orientation: {
            heading: CesiumMath.toRadians(0),
            pitch: CesiumMath.toRadians(-48),
            roll: 0,
          },
          duration: 0,
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
      resetSelectedBuilding()
      clearWaterPrimitive()

      if (viewer.current) {
        viewer.current.destroy()
        viewer.current = null
      }
    }
  }, [metadata])

  useEffect(() => {
    if (!viewerReady || !dataReady || !topology) return

    computeAutoVerticalOffset()
      .catch((error) => {
        console.warn('Vertical calibration error:', error)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [viewerReady, dataReady, topology])

  useEffect(() => {
    if (!viewerReady || !dataReady || !topology || !meshFrames || didInitialZoomRef.current) return
    if (!viewer.current) return

    const peakFrame = getPeakFrame(meshFrames.frames)
    if (!peakFrame) return

    const pose = computeFloodCameraPose(topology, peakFrame)
    if (!pose) return

    didInitialZoomRef.current = true

    viewer.current.camera.flyTo({
      destination: pose.destination,
      orientation: pose.orientation,
      duration: 2.2,
    })
  }, [viewerReady, dataReady, topology, meshFrames])

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

      <button className="scene-back-btn" onClick={onBack}>
        ← Retour
      </button>

      {isLoading && (
        <div className="map3d-loading">Chargement inondation urbaine...</div>
      )}

      <div className="simulation-panel">
        <div className="simulation-title">La Rochelle — Inondation urbaine</div>
        <div className="simulation-subtitle">
          {dataReady ? '✅ Mesh Xynthia chargé' : '⏳ Chargement données...'}
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
          <span className="sim-value" style={{ color: activeColor }}>
            {currentFrame + 1}
          </span>
        </div>

        <div className="sim-scenarios">
          <button
            className={`sim-btn ${currentFrame === 0 ? 'active' : ''}`}
            onClick={() => jumpToFrame(0)}
          >
            Début
          </button>
          <button
            className="sim-btn"
            onClick={() => jumpToFrame(Math.floor(((meshFrames?.frames.length ?? 1) - 1) * 0.35))}
          >
            Montée
          </button>
          <button
            className={`sim-btn ${currentFrame === peakFrameIndex ? 'active' : ''}`}
            onClick={() => jumpToFrame(peakFrameIndex)}
          >
            Pic
          </button>
          <button
            className="sim-btn"
            onClick={() => jumpToFrame(Math.max((meshFrames?.frames.length ?? 1) - 1, 0))}
          >
            Fin
          </button>
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
          {!meshFrames ? '⏳ Chargement...' : isAnimating ? '⏹ Arrêter' : '▶ Lancer simulation'}
        </button>

        <div className="sim-slider-row" style={{ marginTop: 10 }}>
          <span className="sim-label">Z offset</span>
          <input
            type="range"
            min={-20}
            max={20}
            step={0.1}
            value={userVerticalOffsetM}
            onChange={e => setUserVerticalOffsetM(parseFloat(e.target.value))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#9ecbff' }}>
            {userVerticalOffsetM.toFixed(1)} m
          </span>
        </div>

        <div className="sim-slider-row" style={{ marginTop: 10 }}>
          <span className="sim-label">Speed</span>
          <input
            type="range"
            min={1}
            max={3600}
            step={1}
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: '#9ecbff' }}>
            {playbackSpeed.toFixed(0)}x
          </span>
        </div>

        <div className="sim-frame-info">
          Auto offset: {autoVerticalOffsetM.toFixed(2)} m
        </div>

        <div className="sim-frame-info">
          Effective offset: {effectiveVerticalOffsetM.toFixed(2)} m
        </div>

        <div className="sim-frame-info">
          Simulation time: {currentTimeH.toFixed(3)} h
        </div>

        <div className="sim-frame-info">
          Wave time: {waveTimeS.toFixed(1)} s
        </div>

        {currentPair && (
          <div className="sim-frame-info">
            Interp: F{currentPair.indexA + 1} → F{currentPair.indexB + 1} — α={currentPair.alpha.toFixed(2)}
          </div>
        )}

        {topology && (
          <div className="sim-frame-info">
            Mesh: {topology.vertex_count} vertices — {topology.triangle_count} triangles
          </div>
        )}

        {currentPair && (
          <div className="sim-info" style={{ borderColor: activeColor }}>
            <span style={{ color: activeColor, fontWeight: 600 }}>
              {interpolatedFloodedCells} cellules inondées
            </span>
            <span style={{ color: '#888', fontSize: 11 }}>
              {' '}— {currentPair.frameA.ts}
            </span>
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
          </div>

          <div className="building-footer">Source : OpenStreetMap</div>
        </div>
      )}
    </>
  )
}