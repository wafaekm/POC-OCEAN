import { useEffect, useMemo, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D/Map3D.css'
import WW3Legend from './Map2D/WW3Legend'

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

const SOURCE_MANIFESTS = {
  waves: '/processed/ww3_aligned/export/waves/manifest.json',
  level: '/processed/ww3_aligned/export/level/manifest.json',
  tides: '/processed/ww3_aligned/export/tides/manifest.json',
} as const

const WIND_CZML_URL = '/processed/ww3_aligned/export/wind.czml'
const CURRENT_CZML_URL = '/processed/ww3_aligned/export/current.czml'

const PLACEHOLDER_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XgnkAAAAASUVORK5CYII='

const MATERIAL_TYPE = 'WW3RasterSurfaceAnimatedMultiSource'
const WW3_SURFACE_LIFT_M = 2.5
const TERRAIN_SAMPLE_BATCH = 700
const FRAME_PLAY_INTERVAL_MS = 900
const MAX_MESH_SIZE = 180

type Props = {
  onBack: () => void
}

type ScalarSourceKey = 'waves' | 'level' | 'tides'
type UiVariableKey = 'hs' | 'ptp' | 'dir' | 'phs0' | 'ptp0' | 'zos' | 'tide_height'
type BasemapKey = 'ion' | 'osm' | 'carto'

type VariableDef = {
  key: UiVariableKey
  label: string
  unit: string
  legendKey?: 'hs' | 'tp' | 'dir' | 'phs0' | 'ptp0'
  assetKeys: string[]
}

type SourceDef = {
  key: ScalarSourceKey
  label: string
  shortLabel: string
  manifestUrl: string
  variables: VariableDef[]
}

type BBox = {
  lon_min: number
  lat_min: number
  lon_max: number
  lat_max: number
}

type MeshPoint = {
  id: number
  lon: number
  lat: number
  ix: number
  iy: number
}

type RasterInfo = {
  width: number
  height: number
  points: MeshPoint[]
  pointById: Map<number, MeshPoint>
  pointIdGrid: number[][]
  vertexIndexByPointId: Map<number, number>
  lons: number[]
  lats: number[]
}

type MeshVertex = {
  id: number
  lon: number
  lat: number
}

type MeshTopology = {
  vertices: MeshVertex[]
  triangles: number[]
}

type VariableMeta = {
  unit?: string | null
  vmin?: number | null
  vmax?: number | null
  colormap?: string | null
}

type ScalarManifestFrame = {
  ts: string
  assets: Record<string, string>
}

type ScalarManifestInfo = {
  bbox: BBox
  width: number
  height: number
  variables: string[]
  variableMeta: Record<string, VariableMeta>
  frames: ScalarManifestFrame[]
  crs?: string | null
  timestepSeconds?: number | null
}

const SOURCE_DEFS: SourceDef[] = [
  {
    key: 'waves',
    label: 'Vagues',
    shortLabel: 'Waves',
    manifestUrl: SOURCE_MANIFESTS.waves,
    variables: [
      { key: 'hs', label: 'Hs', unit: 'm', legendKey: 'hs', assetKeys: ['hs'] },
      { key: 'ptp', label: 'Tp', unit: 's', legendKey: 'tp', assetKeys: ['ptp', 'tp'] },
      { key: 'dir', label: 'Dir', unit: '°', legendKey: 'dir', assetKeys: ['dir', 'pdir1'] },
      { key: 'phs0', label: 'Hs houle 1', unit: 'm', legendKey: 'phs0', assetKeys: ['phs0', 'phs1'] },
      { key: 'ptp0', label: 'Tp houle 1', unit: 's', legendKey: 'ptp0', assetKeys: ['ptp0', 'ptp1'] },
    ],
  },
  {
    key: 'level',
    label: 'Niveau de mer',
    shortLabel: 'Level',
    manifestUrl: SOURCE_MANIFESTS.level,
    variables: [{ key: 'zos', label: 'Niveau', unit: 'm', assetKeys: ['zos'] }],
  },
  {
    key: 'tides',
    label: 'Marée',
    shortLabel: 'Tides',
    manifestUrl: SOURCE_MANIFESTS.tides,
    variables: [{ key: 'tide_height', label: 'Marée', unit: 'm', assetKeys: ['tide_height'] }],
  },
]

const BASEMAPS: { key: BasemapKey; label: string }[] = [
  { key: 'ion', label: 'Satellite' },
  { key: 'osm', label: 'OSM' },
  { key: 'carto', label: 'Clair' },
]

let materialRegistered = false

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function findSourceDef(key: ScalarSourceKey) {
  return SOURCE_DEFS.find(item => item.key === key) ?? SOURCE_DEFS[0]
}

function findVariableDef(sourceKey: ScalarSourceKey, variableKey: UiVariableKey) {
  const source = findSourceDef(sourceKey)
  return source.variables.find(item => item.key === variableKey) ?? source.variables[0]
}

function normalizeTimestampToIsoUtc(ts: string) {
  const value = String(ts ?? '').trim()
  if (!value) return null

  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
    return value.replace(' ', 'T')
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00Z`
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}$/.test(value)) {
    return `${value.replace(' ', 'T')}:00:00Z`
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(value)) {
    return `${value.replace(' ', 'T')}:00Z`
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) {
    return `${value.replace(' ', 'T')}Z`
  }

  return value.replace(' ', 'T')
}

function parseSimulationJulianDate(ts: string) {
  const normalized = normalizeTimestampToIsoUtc(ts)

  if (normalized) {
    try {
      return Cesium.JulianDate.fromIso8601(normalized)
    } catch {}
  }

  const fallbackDate = new Date(ts)
  if (!Number.isNaN(fallbackDate.getTime())) {
    return Cesium.JulianDate.fromDate(fallbackDate)
  }

  return Cesium.JulianDate.now()
}

function configureSimulationClock(viewer: Cesium.Viewer, frameTimes: Cesium.JulianDate[]) {
  if (!frameTimes.length) return

  viewer.clock.startTime = Cesium.JulianDate.clone(frameTimes[0])
  viewer.clock.stopTime = Cesium.JulianDate.clone(frameTimes[frameTimes.length - 1])
  viewer.clock.currentTime = Cesium.JulianDate.clone(frameTimes[0])
  viewer.clock.clockRange =
    frameTimes.length > 1 ? Cesium.ClockRange.LOOP_STOP : Cesium.ClockRange.UNBOUNDED
  viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER
  viewer.clock.multiplier = 1
  viewer.clock.shouldAnimate = false
}

function computeDayBlend(time: Cesium.JulianDate, lon: number, lat: number) {
  try {
    const sunInertial =
      Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time)
    const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time)

    if (!sunInertial || !icrfToFixed) {
      return 1
    }

    const sunFixed = Cesium.Matrix3.multiplyByVector(
      icrfToFixed,
      sunInertial,
      new Cesium.Cartesian3()
    )

    const sunDirection = Cesium.Cartesian3.normalize(sunFixed, new Cesium.Cartesian3())
    const surfacePoint = Cesium.Cartesian3.fromDegrees(lon, lat, 0)
    const surfaceNormal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
      surfacePoint,
      new Cesium.Cartesian3()
    )

    const dot = Cesium.Cartesian3.dot(surfaceNormal, sunDirection)
    return clamp((dot + 0.22) / 1.22, 0.16, 1)
  } catch {
    return 1
  }
}

function registerAnimatedMaterial() {
  if (materialRegistered) return

  Cesium.Material._materialCache.addMaterial(MATERIAL_TYPE, {
    fabric: {
      type: MATERIAL_TYPE,
      uniforms: {
        image: PLACEHOLDER_IMAGE,
        time: 0,
        dayBlend: 1,
        swellStrength: 0.18,
        foamStrength: 0.42,
        swellSpeed: 0.44,
        shoreSpeed: 1.12,
      },
      source: `
        uniform sampler2D image;
        uniform float time;
        uniform float dayBlend;
        uniform float swellStrength;
        uniform float foamStrength;
        uniform float swellSpeed;
        uniform float shoreSpeed;

        czm_material czm_getMaterial(czm_materialInput materialInput)
        {
          czm_material material = czm_getDefaultMaterial(materialInput);
          vec2 uv = materialInput.st;

          vec4 base = texture(image, uv);
          if (base.a < 0.01) {
            material.diffuse = vec3(0.0);
            material.alpha = 0.0;
            return material;
          }

          float t = time;

          float swellA = sin((uv.x * 6.2 + uv.y * 2.2) * 6.28318 - t * swellSpeed);
          float swellB = sin((uv.x * 3.0 - uv.y * 5.0) * 6.28318 + t * swellSpeed * 0.86);
          float swellC = sin((uv.x * 9.2 + uv.y * 6.6) * 6.28318 - t * swellSpeed * 1.18);

          float swell = 0.5 + 0.5 * (swellA * 0.5 + swellB * 0.32 + swellC * 0.18);
          swell = clamp(swell, 0.0, 1.0);

          float ambient = mix(0.42, 1.0, dayBlend);
          float emissiveFactor = mix(0.75, 1.0, dayBlend);

          vec3 color = base.rgb;
          color *= ambient;
          color *= 1.0 + swell * (swellStrength * 1.35);

          material.diffuse = color;
          material.emission = vec3(swell * 0.05 * emissiveFactor);
          material.alpha = base.a;

          return material;
        }
      `,
    },
    translucent: () => true,
  })

  materialRegistered = true
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`)
  }
  return response.json()
}

function makeAssetUrl(assetPath: string, manifestUrl: string) {
  if (!assetPath) return PLACEHOLDER_IMAGE
  if (/^(https?:)?\/\//.test(assetPath)) return assetPath
  if (assetPath.startsWith('/')) return assetPath
  return new URL(assetPath, new URL(manifestUrl, window.location.href)).toString()
}

function formatFrameLabel(ts: string) {
  if (!ts) return '—'
  const raw = ts.replace('T', ' ')
  const chunks = raw.split(' ')
  if (chunks.length < 2) return raw
  return chunks[1].slice(0, 5)
}

function formatNumber(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

function resolveBBox(raw: any): BBox | null {
  const source = raw?.bbox ?? raw?.bounds ?? raw?.extent ?? null

  if (Array.isArray(source) && source.length >= 4) {
    return {
      lon_min: Number(source[0]),
      lat_min: Number(source[1]),
      lon_max: Number(source[2]),
      lat_max: Number(source[3]),
    }
  }

  if (source && typeof source === 'object') {
    const lonMin = source.lon_min ?? source.min_lon ?? source.xmin ?? source.west
    const latMin = source.lat_min ?? source.min_lat ?? source.ymin ?? source.south
    const lonMax = source.lon_max ?? source.max_lon ?? source.xmax ?? source.east
    const latMax = source.lat_max ?? source.max_lat ?? source.ymax ?? source.north

    if ([lonMin, latMin, lonMax, latMax].every(v => v !== undefined && v !== null)) {
      return {
        lon_min: Number(lonMin),
        lat_min: Number(latMin),
        lon_max: Number(lonMax),
        lat_max: Number(latMax),
      }
    }
  }

  return null
}

function resolveSize(raw: any): { width: number; height: number } | null {
  const width =
    raw?.width ??
    raw?.raster?.width ??
    raw?.grid?.width ??
    raw?.grid_width ??
    raw?.nx ??
    raw?.shape?.[1] ??
    null

  const height =
    raw?.height ??
    raw?.raster?.height ??
    raw?.grid?.height ??
    raw?.grid_height ??
    raw?.ny ??
    raw?.shape?.[0] ??
    null

  if (!width || !height) return null

  return {
    width: Number(width),
    height: Number(height),
  }
}

function parseVariableMeta(raw: any): Record<string, VariableMeta> {
  const variables = raw?.variables
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    return {}
  }

  const out: Record<string, VariableMeta> = {}

  Object.entries(variables).forEach(([key, value]: [string, any]) => {
    out[key] = {
      unit: value?.unit ?? null,
      vmin: value?.vmin != null ? Number(value.vmin) : null,
      vmax: value?.vmax != null ? Number(value.vmax) : null,
      colormap: value?.colormap ?? null,
    }
  })

  return out
}

function buildFramesFromVariableFileLists(raw: any, manifestUrl: string) {
  const variables = raw?.variables

  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    return []
  }

  const frameMap = new Map<string, ScalarManifestFrame>()

  Object.entries(variables).forEach(([variableKey, variableRaw]: [string, any]) => {
    const files = variableRaw?.files

    if (!Array.isArray(files)) return

    files.forEach((fileRaw: any) => {
      const ts = String(fileRaw?.time ?? fileRaw?.ts ?? fileRaw?.timestamp ?? '').trim()
      const path = String(fileRaw?.path ?? '').trim()

      if (!ts || !path) return

      if (!frameMap.has(ts)) {
        frameMap.set(ts, {
          ts,
          assets: {},
        })
      }

      const frame = frameMap.get(ts)
      if (!frame) return

      frame.assets[variableKey] = makeAssetUrl(path, manifestUrl)
    })
  })

  return Array.from(frameMap.values())
    .filter(frame => Object.keys(frame.assets).length > 0)
    .sort((a, b) => a.ts.localeCompare(b.ts))
}

async function loadImageSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error(`Failed to load image ${url}`))
    img.src = url
  })
}

async function findFirstLoadableImageSize(frames: ScalarManifestFrame[]) {
  for (const frame of frames) {
    for (const url of Object.values(frame.assets)) {
      try {
        return await loadImageSize(url)
      } catch {}
    }
  }

  throw new Error('No loadable raster image found in manifest')
}

async function loadScalarManifestInfo(manifestUrl: string): Promise<ScalarManifestInfo> {
  const raw = await loadJson<any>(manifestUrl)
  const bbox = resolveBBox(raw)

  if (!bbox) {
    throw new Error('Manifest bbox not found')
  }

  const frames = buildFramesFromVariableFileLists(raw, manifestUrl)

  if (!frames.length) {
    throw new Error('Manifest frames not found')
  }

  let size = resolveSize(raw)

  if (!size) {
    size = await findFirstLoadableImageSize(frames)
  }

  const variableMeta = parseVariableMeta(raw)
  const variables = Object.keys(variableMeta).length
    ? Object.keys(variableMeta)
    : Array.from(new Set(frames.flatMap(frame => Object.keys(frame.assets))))

  return {
    bbox,
    width: size.width,
    height: size.height,
    variables,
    variableMeta,
    frames,
    crs: raw?.crs ?? null,
    timestepSeconds:
      raw?.timestep_seconds ??
      raw?.time_step_seconds ??
      raw?.dt_seconds ??
      (raw?.timestep_h != null ? Number(raw.timestep_h) * 3600 : null),
  }
}

function fitMeshSize(width: number, height: number, maxSize = MAX_MESH_SIZE) {
  const maxDim = Math.max(width, height)
  if (maxDim <= maxSize) {
    return { width, height }
  }

  const scale = maxSize / maxDim
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
  }
}

function buildRasterInfoFromBBox(bbox: BBox, width: number, height: number): RasterInfo {
  const points: MeshPoint[] = []
  const pointById = new Map<number, MeshPoint>()
  const vertexIndexByPointId = new Map<number, number>()
  const pointIdGrid = Array.from({ length: height }, () => Array.from({ length: width }, () => -1))
  const lons: number[] = []
  const lats: number[] = []

  for (let x = 0; x < width; x += 1) {
    lons.push(lerp(bbox.lon_min, bbox.lon_max, width === 1 ? 0 : x / (width - 1)))
  }

  for (let y = 0; y < height; y += 1) {
    lats.push(lerp(bbox.lat_min, bbox.lat_max, height === 1 ? 0 : y / (height - 1)))
  }

  let id = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point: MeshPoint = {
        id,
        lon: lons[x],
        lat: lats[y],
        ix: x,
        iy: y,
      }

      points.push(point)
      pointById.set(id, point)
      vertexIndexByPointId.set(id, points.length - 1)
      pointIdGrid[y][x] = id
      id += 1
    }
  }

  return {
    width,
    height,
    points,
    pointById,
    pointIdGrid,
    vertexIndexByPointId,
    lons,
    lats,
  }
}

function buildTopologyFromRaster(raster: RasterInfo): MeshTopology {
  const vertices: MeshVertex[] = raster.points.map(point => ({
    id: point.id,
    lon: point.lon,
    lat: point.lat,
  }))

  const triangles: number[] = []

  for (let y = 0; y < raster.height - 1; y += 1) {
    for (let x = 0; x < raster.width - 1; x += 1) {
      const id00 = raster.pointIdGrid[y][x]
      const id10 = raster.pointIdGrid[y][x + 1]
      const id01 = raster.pointIdGrid[y + 1][x]
      const id11 = raster.pointIdGrid[y + 1][x + 1]

      const i00 = raster.vertexIndexByPointId.get(id00)
      const i10 = raster.vertexIndexByPointId.get(id10)
      const i01 = raster.vertexIndexByPointId.get(id01)
      const i11 = raster.vertexIndexByPointId.get(id11)

      if (i00 === undefined || i10 === undefined || i01 === undefined || i11 === undefined) {
        continue
      }

      triangles.push(i00, i10, i11)
      triangles.push(i00, i11, i01)
    }
  }

  return { vertices, triangles }
}

async function sampleTerrainForRaster(
  viewer: Cesium.Viewer,
  raster: RasterInfo
): Promise<Map<number, number>> {
  const terrainByPointId = new Map<number, number>()

  for (let start = 0; start < raster.points.length; start += TERRAIN_SAMPLE_BATCH) {
    const batch = raster.points.slice(start, start + TERRAIN_SAMPLE_BATCH)
    const cartographics = batch.map(point => Cesium.Cartographic.fromDegrees(point.lon, point.lat))
    const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics)

    for (let i = 0; i < batch.length; i += 1) {
      const height = sampled[i]?.height
      terrainByPointId.set(batch[i].id, Number.isFinite(height) ? Number(height) : 0)
    }
  }

  return terrainByPointId
}

function createSurfacePrimitive(
  viewer: Cesium.Viewer,
  topology: MeshTopology,
  bbox: BBox,
  terrainByPointId: Map<number, number>
) {
  const positions = new Float64Array(topology.vertices.length * 3)
  const sts = new Float32Array(topology.vertices.length * 2)

  topology.vertices.forEach((vertex, index) => {
    const terrainHeight = terrainByPointId.get(vertex.id) ?? 0
    const finalHeight = terrainHeight + WW3_SURFACE_LIFT_M
    const cart = Cesium.Cartesian3.fromDegrees(vertex.lon, vertex.lat, finalHeight)

    positions[index * 3] = cart.x
    positions[index * 3 + 1] = cart.y
    positions[index * 3 + 2] = cart.z

    const u = (vertex.lon - bbox.lon_min) / Math.max(1e-9, bbox.lon_max - bbox.lon_min)
    const v = (vertex.lat - bbox.lat_min) / Math.max(1e-9, bbox.lat_max - bbox.lat_min)

    sts[index * 2] = clamp(u, 0, 1)
    sts[index * 2 + 1] = clamp(v, 0, 1)
  })

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: sts,
      }),
    },
    indices: new Uint32Array(topology.triangles),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
  })

  const material = new Cesium.Material({
    fabric: {
      type: MATERIAL_TYPE,
      uniforms: {
        image: PLACEHOLDER_IMAGE,
        time: 0,
        dayBlend: 1,
        swellStrength: 0.18,
        foamStrength: 0.42,
        swellSpeed: 0.44,
        shoreSpeed: 1.12,
      },
    },
  })

  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry }),
    appearance: new Cesium.MaterialAppearance({
      material,
      translucent: true,
      closed: false,
      faceForward: true,
      flat: false,
      materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
    }),
    asynchronous: false,
  })

  viewer.scene.primitives.add(primitive)

  return { primitive, material }
}

async function createBasemapProvider(key: BasemapKey) {
  if (key === 'ion') {
    return Cesium.IonImageryProvider.fromAssetId(2)
  }

  if (key === 'osm') {
    return new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
    })
  }

  return new Cesium.UrlTemplateImageryProvider({
    url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    credit: '© OpenStreetMap contributors © CARTO',
  })
}

function getFrameAsset(frame: ScalarManifestFrame | null | undefined, variableDef: VariableDef | null | undefined) {
  if (!frame || !variableDef) return null

  for (const assetKey of variableDef.assetKeys) {
    if (frame.assets[assetKey]) {
      return frame.assets[assetKey]
    }
  }

  return null
}

function getResolvedAssetKey(frame: ScalarManifestFrame | null | undefined, variableDef: VariableDef | null | undefined) {
  if (!frame || !variableDef) return null

  for (const assetKey of variableDef.assetKeys) {
    if (frame.assets[assetKey]) {
      return assetKey
    }
  }

  return null
}

async function canLoadVariable(manifest: ScalarManifestInfo, variableDef: VariableDef) {
  const candidateUrls = manifest.frames
    .map(frame => getFrameAsset(frame, variableDef))
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)

  if (!candidateUrls.length) return false

  for (const url of candidateUrls) {
    try {
      await loadImageSize(url)
      return true
    } catch {}
  }

  return false
}

function formatRange(meta?: VariableMeta | null) {
  if (!meta) return '—'
  if (meta.vmin == null || meta.vmax == null) return '—'
  return `${formatNumber(meta.vmin)} → ${formatNumber(meta.vmax)}`
}

export default function LaRochelleWaveView({ onBack }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const primitiveRef = useRef<Cesium.Primitive | null>(null)
  const materialRef = useRef<Cesium.Material | null>(null)
  const preRenderRef = useRef<((scene: Cesium.Scene, time: Cesium.JulianDate) => void) | null>(null)

  const activeManifestRef = useRef<ScalarManifestInfo | null>(null)
  const manifestsCacheRef = useRef<Partial<Record<ScalarSourceKey, ScalarManifestInfo>>>({})
  const frameTimesRef = useRef<Cesium.JulianDate[]>([])
  const windDataSourceRef = useRef<Cesium.CzmlDataSource | null>(null)
  const currentDataSourceRef = useRef<Cesium.CzmlDataSource | null>(null)

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [selectedSource, setSelectedSource] = useState<ScalarSourceKey>('waves')
  const [selectedVariable, setSelectedVariable] = useState<UiVariableKey>('ptp')
  const [availableVariables, setAvailableVariables] = useState<UiVariableKey[]>([])
  const [currentFrame, setCurrentFrame] = useState(0)
  const [loadingText, setLoadingText] = useState('Chargement WW3...')
  const [errorText, setErrorText] = useState('')
  const [basemap, setBasemap] = useState<BasemapKey>('ion')
  const [showWind, setShowWind] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const sourceDef = useMemo(() => findSourceDef(selectedSource), [selectedSource])
  const selectedVariableDef = useMemo(
    () => findVariableDef(selectedSource, selectedVariable),
    [selectedSource, selectedVariable]
  )

  useEffect(() => {
    registerAnimatedMaterial()
  }, [])

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    let destroyed = false

    const initViewer = async () => {
      try {
        Cesium.Ion.defaultAccessToken = CESIUM_TOKEN

        const terrain = await Cesium.createWorldTerrainAsync({
          requestVertexNormals: true,
          requestWaterMask: true,
        })

        if (destroyed || !containerRef.current) return

        const viewer = new Cesium.Viewer(containerRef.current, {
          terrainProvider: terrain,
          animation: false,
          timeline: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          shadows: true,
          requestRenderMode: false,
        })

        viewer.scene.globe.depthTestAgainstTerrain = true
        viewer.scene.globe.enableLighting = true
        viewer.scene.globe.dynamicAtmosphereLighting = true
        viewer.scene.globe.dynamicAtmosphereLightingFromSun = true
        viewer.scene.globe.showGroundAtmosphere = true
        viewer.scene.highDynamicRange = true
        viewer.scene.postProcessStages.fxaa.enabled = true
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
        viewer.clock.shouldAnimate = false

        const sceneAny = viewer.scene as any
        const cesiumAny = Cesium as any
        if (sceneAny.atmosphere && cesiumAny.DynamicAtmosphereLightingType) {
          sceneAny.atmosphere.dynamicLighting = cesiumAny.DynamicAtmosphereLightingType.SUNLIGHT
        }

        viewer.imageryLayers.removeAll()
        viewer.imageryLayers.addImageryProvider(await createBasemapProvider('ion'))

        try {
          const buildings = await Cesium.createOsmBuildingsAsync({
            style: new Cesium.Cesium3DTileStyle({
              color: "mix(color('#d9d4cc'), color('#f3eee8'), 0.35)",
            }),
          })
          buildings.shadows = Cesium.ShadowMode.ENABLED
          viewer.scene.primitives.add(buildings)
        } catch {}

        const tick = () => {
          if (!materialRef.current) return
          materialRef.current.uniforms.time = performance.now() * 0.001
        }

        viewer.scene.preRender.addEventListener(tick)
        preRenderRef.current = tick
        viewerRef.current = viewer
      } catch (error) {
        console.error(error)
        setErrorText(error instanceof Error ? error.message : 'Impossible d’initialiser Cesium')
      }
    }

    initViewer()

    return () => {
      destroyed = true

      if (preRenderRef.current && viewerRef.current) {
        viewerRef.current.scene.preRender.removeEventListener(preRenderRef.current)
        preRenderRef.current = null
      }

      if (windDataSourceRef.current && viewerRef.current) {
        viewerRef.current.dataSources.remove(windDataSourceRef.current, true)
        windDataSourceRef.current = null
      }

      if (currentDataSourceRef.current && viewerRef.current) {
        viewerRef.current.dataSources.remove(currentDataSourceRef.current, true)
        currentDataSourceRef.current = null
      }

      if (primitiveRef.current && viewerRef.current) {
        viewerRef.current.scene.primitives.remove(primitiveRef.current)
        primitiveRef.current = null
      }

      if (viewerRef.current) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadSource() {
      try {
        setLoadingText(`Chargement ${sourceDef.label}...`)
        setErrorText('')

        let manifest = manifestsCacheRef.current[selectedSource]

        if (!manifest) {
          manifest = await loadScalarManifestInfo(sourceDef.manifestUrl)
          manifestsCacheRef.current[selectedSource] = manifest
        }

        if (cancelled) return

        const available: UiVariableKey[] = []

        for (const variable of sourceDef.variables) {
          const ok = await canLoadVariable(manifest, variable)
          if (cancelled) return
          if (ok) {
            available.push(variable.key)
          }
        }

        if (!available.length) {
          throw new Error(`Aucune variable exploitable pour ${sourceDef.label}`)
        }

        setAvailableVariables(available)

        const nextVariable = available.includes(selectedVariable)
          ? selectedVariable
          : available[0]

        setSelectedVariable(nextVariable)
        setCurrentFrame(0)

        while (!viewerRef.current && !cancelled) {
          await new Promise(resolve => setTimeout(resolve, 40))
        }

        if (cancelled || !viewerRef.current) return

        const viewer = viewerRef.current
        const frameTimes = manifest.frames.map(frame => parseSimulationJulianDate(frame.ts))
        frameTimesRef.current = frameTimes
        configureSimulationClock(viewer, frameTimes)

        const meshSize = fitMeshSize(manifest.width, manifest.height, MAX_MESH_SIZE)
        const raster = buildRasterInfoFromBBox(manifest.bbox, meshSize.width, meshSize.height)
        const topology = buildTopologyFromRaster(raster)

        setLoadingText(`Calage ${sourceDef.label} sur le terrain...`)

        const terrainByPointId = await sampleTerrainForRaster(viewer, raster)
        if (cancelled) return

        if (primitiveRef.current) {
          viewer.scene.primitives.remove(primitiveRef.current)
          primitiveRef.current = null
          materialRef.current = null
        }

        const { primitive, material } = createSurfacePrimitive(
          viewer,
          topology,
          manifest.bbox,
          terrainByPointId
        )

        primitiveRef.current = primitive
        materialRef.current = material
        activeManifestRef.current = manifest

        const variableDef = findVariableDef(selectedSource, nextVariable)
        const firstFrame = manifest.frames[0]
        const firstImage =
          getFrameAsset(firstFrame, variableDef) ??
          Object.values(firstFrame.assets)[0] ??
          PLACEHOLDER_IMAGE

        material.uniforms.image = firstImage
        material.uniforms.dayBlend = computeDayBlend(
          frameTimes[0],
          (manifest.bbox.lon_min + manifest.bbox.lon_max) * 0.5,
          (manifest.bbox.lat_min + manifest.bbox.lat_max) * 0.5
        )

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            (manifest.bbox.lon_min + manifest.bbox.lon_max) * 0.5,
            (manifest.bbox.lat_min + manifest.bbox.lat_max) * 0.5,
            24000
          ),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-58),
            roll: 0,
          },
          duration: 1.2,
        })

        setIsReady(true)
        setLoadingText('')
      } catch (error) {
        console.error('Scalar source load error:', error)
        setErrorText(error instanceof Error ? error.message : 'Erreur au chargement')
        setLoadingText('')
      }
    }

    loadSource()

    return () => {
      cancelled = true
    }
  }, [selectedSource])

  useEffect(() => {
    if (!viewerRef.current) return

    let cancelled = false

    const applyBasemap = async () => {
      try {
        const provider = await createBasemapProvider(basemap)
        if (cancelled || !viewerRef.current) return
        const viewer = viewerRef.current
        viewer.imageryLayers.removeAll()
        viewer.imageryLayers.addImageryProvider(provider)
      } catch (error) {
        console.error(error)
      }
    }

    applyBasemap()

    return () => {
      cancelled = true
    }
  }, [basemap])

  useEffect(() => {
    if (!isReady) return

    const viewer = viewerRef.current
    const material = materialRef.current
    const manifest = activeManifestRef.current

    if (!viewer || !material || !manifest) return

    const safeFrameIndex = clamp(currentFrame, 0, Math.max(0, manifest.frames.length - 1))
    const frame = manifest.frames[safeFrameIndex]
    const frameTime = frameTimesRef.current[safeFrameIndex]
    const variableDef = findVariableDef(selectedSource, selectedVariable)

    if (!frame || !frameTime || !variableDef) return

    const image =
      getFrameAsset(frame, variableDef) ??
      Object.values(frame.assets)[0] ??
      PLACEHOLDER_IMAGE

    material.uniforms.image = image
    material.uniforms.dayBlend = computeDayBlend(
      frameTime,
      (manifest.bbox.lon_min + manifest.bbox.lon_max) * 0.5,
      (manifest.bbox.lat_min + manifest.bbox.lat_max) * 0.5
    )

    viewer.clock.currentTime = Cesium.JulianDate.clone(frameTime)
    viewer.clock.shouldAnimate = false
    viewer.scene.requestRender()
  }, [currentFrame, selectedVariable, selectedSource, isReady])

  useEffect(() => {
    if (!isPlaying) return

    const manifest = activeManifestRef.current
    if (!manifest?.frames.length) return

    const id = window.setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % manifest.frames.length)
    }, FRAME_PLAY_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [isPlaying, selectedSource])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !isReady) return

    let cancelled = false

    const syncWind = async () => {
      if (!showWind) {
        if (windDataSourceRef.current) {
          windDataSourceRef.current.show = false
        }
        return
      }

      if (!windDataSourceRef.current) {
        const source = await Cesium.CzmlDataSource.load(WIND_CZML_URL)
        if (cancelled || !viewerRef.current) return
        windDataSourceRef.current = source
        viewerRef.current.dataSources.add(source)
      }

      windDataSourceRef.current.show = true
    }

    syncWind().catch(error => {
      console.error(error)
      setErrorText(error instanceof Error ? error.message : 'Erreur chargement vent')
    })

    return () => {
      cancelled = true
    }
  }, [showWind, isReady])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !isReady) return

    let cancelled = false

    const syncCurrent = async () => {
      if (!showCurrent) {
        if (currentDataSourceRef.current) {
          currentDataSourceRef.current.show = false
        }
        return
      }

      if (!currentDataSourceRef.current) {
        const source = await Cesium.CzmlDataSource.load(CURRENT_CZML_URL)
        if (cancelled || !viewerRef.current) return
        currentDataSourceRef.current = source
        viewerRef.current.dataSources.add(source)
      }

      currentDataSourceRef.current.show = true
    }

    syncCurrent().catch(error => {
      console.error(error)
      setErrorText(error instanceof Error ? error.message : 'Erreur chargement courant')
    })

    return () => {
      cancelled = true
    }
  }, [showCurrent, isReady])

  const manifest = activeManifestRef.current
  const frameCount = manifest?.frames.length ?? 0
  const safeFrameIndex = manifest ? clamp(currentFrame, 0, Math.max(0, manifest.frames.length - 1)) : 0
  const currentFrameData = manifest?.frames[safeFrameIndex] ?? null
  const resolvedAssetKey = getResolvedAssetKey(currentFrameData, selectedVariableDef)
  const variableMeta = resolvedAssetKey ? manifest?.variableMeta?.[resolvedAssetKey] : null
  const meshSize = manifest ? fitMeshSize(manifest.width, manifest.height, MAX_MESH_SIZE) : null
  const progressPercent = frameCount > 1 ? ((safeFrameIndex + 1) / frameCount) * 100 : 0

  const canShowLegend =
    showLegend &&
    selectedSource === 'waves' &&
    Boolean(selectedVariableDef.legendKey)

  return (
    <div className="ww3-scene">
      <div ref={containerRef} className="map3d-container" />

      <button className="scene-back-btn" onClick={onBack} type="button">
        ← Retour
      </button>

      <aside className={`ww3-dock ${panelCollapsed ? 'collapsed' : ''}`}>
        <div className="ww3-dock-header">
          <div className="ww3-dock-headings">
            <span className="ww3-dock-kicker">{sourceDef.label}</span>
            <div className="ww3-dock-title">Surface WW3</div>
            <div className="ww3-dock-status">
              {currentFrameData ? currentFrameData.ts : loadingText || 'Chargement'}
            </div>
          </div>

          <div className="ww3-dock-actions">
            <button
              className={`ww3-ghost-btn ${showDetails ? 'active' : ''}`}
              onClick={() => setShowDetails(v => !v)}
              type="button"
            >
              Détails
            </button>

            <button
              className="ww3-icon-btn"
              onClick={() => setPanelCollapsed(v => !v)}
              type="button"
              aria-label={panelCollapsed ? 'Déployer le panneau' : 'Réduire le panneau'}
            >
              {panelCollapsed ? '+' : '−'}
            </button>
          </div>
        </div>

        {panelCollapsed ? (
          <div className="ww3-dock-mini">
            <button
              className={`ww3-primary-btn compact ${isPlaying ? 'stop' : ''}`}
              onClick={() => setIsPlaying(v => !v)}
              type="button"
            >
              {isPlaying ? 'Pause' : 'Lecture'}
            </button>

            <div className="ww3-mini-meta">
              <strong>{selectedVariableDef.label}</strong>
              <span>{formatFrameLabel(currentFrameData?.ts ?? '') || '—'}</span>
            </div>
          </div>
        ) : (
          <div className="ww3-dock-body">
            <div className="ww3-section">
              <div className="ww3-section-label">Source</div>
              <div className="ww3-chip-row">
                {SOURCE_DEFS.map(source => (
                  <button
                    key={source.key}
                    type="button"
                    onClick={() => setSelectedSource(source.key)}
                    className={`ww3-chip ${selectedSource === source.key ? 'active' : ''}`}
                  >
                    {source.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="ww3-section">
              <div className="ww3-section-label">Variable</div>
              <div className="ww3-chip-row">
                {sourceDef.variables.map(variable => {
                  const available = availableVariables.includes(variable.key)
                  const active = variable.key === selectedVariable

                  return (
                    <button
                      key={variable.key}
                      type="button"
                      disabled={!available}
                      onClick={() => setSelectedVariable(variable.key)}
                      className={`ww3-chip ${active ? 'active' : ''}`}
                    >
                      {variable.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="ww3-main-actions">
              <button
                type="button"
                onClick={() => setIsPlaying(v => !v)}
                className={`ww3-primary-btn ${isPlaying ? 'stop' : ''}`}
              >
                {isPlaying ? 'Pause animation' : 'Lancer animation'}
              </button>
            </div>

            <div className="ww3-toggle-row">
              <button
                type="button"
                onClick={() => setShowWind(v => !v)}
                className={`ww3-toggle-btn ${showWind ? 'active' : ''}`}
              >
                Vent {showWind ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className={`ww3-toggle-btn ${showCurrent ? 'active' : ''}`}
              >
                Courant {showCurrent ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() => setShowLegend(v => !v)}
                className={`ww3-toggle-btn ${showLegend ? 'active' : ''}`}
              >
                Légende {showLegend ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="ww3-timeline-card">
              <div className="ww3-timeline-head">
                <span>{currentFrameData ? formatFrameLabel(currentFrameData.ts) : '—'}</span>
                <span>{safeFrameIndex + 1} / {frameCount || 0}</span>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(frameCount - 1, 0)}
                step={1}
                value={safeFrameIndex}
                onChange={e => setCurrentFrame(parseInt(e.target.value, 10))}
                className="ww3-range"
              />

              <div className="ww3-progress-bar">
                <div
                  className="ww3-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="ww3-timeline-actions">
                <button
                  type="button"
                  className="ww3-mini-btn"
                  onClick={() => setCurrentFrame(0)}
                >
                  Début
                </button>

                <button
                  type="button"
                  className="ww3-mini-btn"
                  onClick={() => setCurrentFrame(prev => Math.max(0, prev - 1))}
                >
                  −1
                </button>

                <button
                  type="button"
                  className="ww3-mini-btn"
                  onClick={() => setCurrentFrame(prev => Math.min(Math.max(frameCount - 1, 0), prev + 1))}
                >
                  +1
                </button>

                <button
                  type="button"
                  className="ww3-mini-btn"
                  onClick={() => setCurrentFrame(Math.max(frameCount - 1, 0))}
                >
                  Fin
                </button>
              </div>
            </div>

            <div className="ww3-kpi-grid">
              <div className="ww3-kpi">
                <span>Variable</span>
                <strong>{selectedVariableDef.label}</strong>
              </div>
              <div className="ww3-kpi">
                <span>Unité</span>
                <strong>{variableMeta?.unit ?? selectedVariableDef.unit}</strong>
              </div>
              <div className="ww3-kpi">
                <span>Plage</span>
                <strong>{formatRange(variableMeta)}</strong>
              </div>
              <div className="ww3-kpi">
                <span>Fond</span>
                <strong>{BASEMAPS.find(item => item.key === basemap)?.label ?? '—'}</strong>
              </div>
            </div>

            {showDetails && (
              <div className="ww3-details">
                <div className="ww3-section">
                  <div className="ww3-section-label">Fond de carte</div>
                  <div className="ww3-chip-row">
                    {BASEMAPS.map(item => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setBasemap(item.key)}
                        className={`ww3-chip ${basemap === item.key ? 'active' : ''}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ww3-meta-list">
                  <div className="ww3-meta-row">
                    <span>Asset lu</span>
                    <strong>{resolvedAssetKey ?? '—'}</strong>
                  </div>
                  <div className="ww3-meta-row">
                    <span>Colormap</span>
                    <strong>{variableMeta?.colormap ?? '—'}</strong>
                  </div>
                  <div className="ww3-meta-row">
                    <span>Raster source</span>
                    <strong>{manifest ? `${manifest.width} × ${manifest.height}` : '—'}</strong>
                  </div>
                  <div className="ww3-meta-row">
                    <span>Maille 3D</span>
                    <strong>{meshSize ? `${meshSize.width} × ${meshSize.height}` : '—'}</strong>
                  </div>
                  <div className="ww3-meta-row">
                    <span>CRS</span>
                    <strong>{manifest?.crs ?? '—'}</strong>
                  </div>
                  <div className="ww3-meta-row">
                    <span>Surface</span>
                    <strong>{`terrain + ${WW3_SURFACE_LIFT_M.toFixed(1)} m`}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {canShowLegend && (
        <WW3Legend
          key={selectedVariableDef.legendKey}
          activeVar={selectedVariableDef.legendKey as any}
          visible
        />
      )}

      {(!isReady || loadingText) && !errorText && (
        <div className="map3d-loading">{loadingText || 'Chargement...'}</div>
      )}

      {errorText && <div className="map3d-loading">{errorText}</div>}
    </div>
  )
}