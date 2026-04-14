import { useEffect, useMemo, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D/Map3D.css'
import WW3Legend from './Map2D/WW3Legend'

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

const PLACEHOLDER_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XgnkAAAAASUVORK5CYII='

const MATERIAL_TYPE = 'WW3SurfaceAnimatedTerrainAligned'
const WW3_SURFACE_LIFT_M = 2.5
const TERRAIN_SAMPLE_BATCH = 700
const FRAME_PLAY_INTERVAL_MS = 900

type Props = {
  onBack: () => void
}

type VariableKey = 'hs' | 'tp' | 'dir' | 'phs0' | 'ptp0'
type BasemapKey = 'ion' | 'osm' | 'carto'

type VariableDef = {
  key: VariableKey
  label: string
  unit: string
}

type ColorStop = {
  value: number
  color: [number, number, number]
}

type WW3Point = {
  id: number
  lon: number
  lat: number
  ix: number
  iy: number
}

type WW3Cell = {
  hs: number | null
  tp: number | null
  dir: number | null
  phs0: number | null
  ptp0: number | null
}

type WW3Frame = {
  ts: string
  nActive: number
  hsMax: number
  hsMean: number
  cells: Record<number, WW3Cell>
  activePointIds: number[]
}

type WW3Metadata = {
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
}

type RasterInfo = {
  width: number
  height: number
  points: WW3Point[]
  pointById: Map<number, WW3Point>
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

type PreparedFrameTextures = {
  variables: Record<VariableKey, string>
  shallowMask: string
}

type SelectedSample = {
  pointId: number
  lon: number
  lat: number
  ts: string
  hs: number | null
  tp: number | null
  dir: number | null
  phs0: number | null
  ptp0: number | null
}

const VARIABLES: VariableDef[] = [
  { key: 'hs', label: 'Hs', unit: 'm' },
  { key: 'tp', label: 'Tp', unit: 's' },
  { key: 'dir', label: 'Dir', unit: '°' },
  { key: 'phs0', label: 'Hs houle 1', unit: 'm' },
  { key: 'ptp0', label: 'Tp houle 1', unit: 's' },
]

const BASEMAPS: { key: BasemapKey; label: string }[] = [
  { key: 'ion', label: 'Satellite' },
  { key: 'osm', label: 'OSM' },
  { key: 'carto', label: 'Clair' },
]

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const value = parseInt(full, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const COLOR_SCALES: Record<VariableKey, ColorStop[]> = {
  hs: [
    { value: 0.0, color: hexToRgb('#001840') },
    { value: 0.25, color: hexToRgb('#003d7a') },
    { value: 0.5, color: hexToRgb('#0066cc') },
    { value: 0.75, color: hexToRgb('#0099ff') },
    { value: 1.0, color: hexToRgb('#00ccff') },
    { value: 1.25, color: hexToRgb('#66ffcc') },
    { value: 1.5, color: hexToRgb('#ffdd00') },
    { value: 2.0, color: hexToRgb('#ff4400') },
  ],
  tp: [
    { value: 0.0, color: hexToRgb('#001840') },
    { value: 4.0, color: hexToRgb('#003388') },
    { value: 6.0, color: hexToRgb('#0066cc') },
    { value: 8.0, color: hexToRgb('#00aaff') },
    { value: 10.0, color: hexToRgb('#44eebb') },
    { value: 12.0, color: hexToRgb('#aaff44') },
    { value: 15.0, color: hexToRgb('#ffdd00') },
    { value: 20.0, color: hexToRgb('#ff4400') },
  ],
  dir: [
    { value: 0.0, color: hexToRgb('#ff0000') },
    { value: 90.0, color: hexToRgb('#ffff00') },
    { value: 180.0, color: hexToRgb('#0088ff') },
    { value: 270.0, color: hexToRgb('#8800ff') },
    { value: 360.0, color: hexToRgb('#ff0000') },
  ],
  phs0: [
    { value: 0.0, color: hexToRgb('#001020') },
    { value: 0.3, color: hexToRgb('#004488') },
    { value: 0.6, color: hexToRgb('#0077cc') },
    { value: 0.9, color: hexToRgb('#00aaff') },
    { value: 1.2, color: hexToRgb('#44eebb') },
    { value: 1.5, color: hexToRgb('#ff8800') },
  ],
  ptp0: [
    { value: 0.0, color: hexToRgb('#001020') },
    { value: 5.0, color: hexToRgb('#003366') },
    { value: 8.0, color: hexToRgb('#0066cc') },
    { value: 10.0, color: hexToRgb('#00aaff') },
    { value: 12.0, color: hexToRgb('#44ddbb') },
    { value: 15.0, color: hexToRgb('#aaff44') },
    { value: 20.0, color: hexToRgb('#ff4400') },
  ],
}

let materialRegistered = false

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
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
        shallowMask: PLACEHOLDER_IMAGE,
        time: 0,
        dayBlend: 1,
        swellStrength: 0.12,
        foamStrength: 0.32,
        swellSpeed: 0.44,
        shoreSpeed: 1.12,
      },
      source: `
        uniform sampler2D image;
        uniform sampler2D shallowMask;
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

          float shallow = texture(shallowMask, uv).r;
          float t = time;

          float swellA = sin((uv.x * 6.2 + uv.y * 2.2) * 6.28318 - t * swellSpeed);
          float swellB = sin((uv.x * 3.0 - uv.y * 5.0) * 6.28318 + t * swellSpeed * 0.86);
          float swellC = sin((uv.x * 9.2 + uv.y * 6.6) * 6.28318 - t * swellSpeed * 1.18);

          float swell = 0.5 + 0.5 * (swellA * 0.5 + swellB * 0.32 + swellC * 0.18);
          swell = clamp(swell, 0.0, 1.0);

          float shoreA = 0.5 + 0.5 * sin((uv.x * 8.0 - uv.y * 12.0) * 6.28318 - t * shoreSpeed);
          float shoreB = 0.5 + 0.5 * sin((uv.x * 13.0 + uv.y * 4.6) * 6.28318 - t * shoreSpeed * 1.22);
          float shoreC = 0.5 + 0.5 * sin((uv.x * 20.0 - uv.y * 16.0) * 6.28318 + t * shoreSpeed * 0.74);

          float foamNoise = shoreA * 0.45 + shoreB * 0.35 + shoreC * 0.20;
          float shoreFoam = smoothstep(0.60, 0.92, foamNoise) * shallow * foamStrength;

      float ambient = mix(0.42, 1.0, dayBlend);
      float foamLight = mix(0.65, 1.0, dayBlend);
      float emissiveFactor = mix(0.75, 1.0, dayBlend);

      vec3 color = base.rgb;
      color *= ambient;
      color *= 1.0 + swell * (swellStrength * 1.35);
      color = mix(color, vec3(1.0), shoreFoam * 0.42 * foamLight);

      material.diffuse = color;
      material.emission = vec3((swell * 0.05 + shoreFoam * 0.14) * emissiveFactor);
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
    throw new Error(`Failed to load ${url}`)
  }
  return response.json()
}

function normalizeCell(raw: any): WW3Cell {
  return {
    hs: raw?.hs ?? null,
    tp: raw?.tp ?? raw?.ptp0 ?? null,
    dir: raw?.dir ?? raw?.pd0 ?? raw?.pdir0 ?? null,
    phs0: raw?.phs0 ?? null,
    ptp0: raw?.ptp0 ?? raw?.tp ?? null,
  }
}

function parseGrid(raw: any): WW3Point[] {
  const pointsSource = Array.isArray(raw) ? raw : raw?.points ?? []
  return pointsSource.map((p: any, index: number) => ({
    id: Number(p?.id ?? index),
    lon: Number(p?.lon),
    lat: Number(p?.lat),
    ix: -1,
    iy: -1,
  }))
}

function parseFrames(raw: any): WW3Frame[] {
  const framesSource = Array.isArray(raw) ? raw : raw?.frames ?? []
  return framesSource.map((frame: any) => {
    const rawCells = frame?.cells ?? {}
    const cells: Record<number, WW3Cell> = {}

    Object.entries(rawCells).forEach(([key, value]) => {
      cells[Number(key)] = normalizeCell(value)
    })

    return {
      ts: String(frame?.ts ?? ''),
      nActive: Number(frame?.n_active ?? Object.keys(cells).length),
      hsMax: Number(frame?.hs_max ?? 0),
      hsMean: Number(frame?.hs_mean ?? 0),
      cells,
      activePointIds: Object.keys(cells).map(k => Number(k)),
    }
  })
}

function buildRasterInfo(points: WW3Point[]): RasterInfo {
  const lonKeys = Array.from(new Set(points.map(p => p.lon.toFixed(6))))
    .map(Number)
    .sort((a, b) => a - b)

  const latKeys = Array.from(new Set(points.map(p => p.lat.toFixed(6))))
    .map(Number)
    .sort((a, b) => a - b)

  const lonIndex = new Map<string, number>()
  const latIndex = new Map<string, number>()

  lonKeys.forEach((lon, index) => lonIndex.set(lon.toFixed(6), index))
  latKeys.forEach((lat, index) => latIndex.set(lat.toFixed(6), index))

  const indexedPoints = points.map(point => ({
    ...point,
    ix: lonIndex.get(point.lon.toFixed(6)) ?? 0,
    iy: latIndex.get(point.lat.toFixed(6)) ?? 0,
  }))

  const pointById = new Map<number, WW3Point>()
  const vertexIndexByPointId = new Map<number, number>()
  const pointIdGrid = Array.from({ length: latKeys.length }, () =>
    Array.from({ length: lonKeys.length }, () => -1)
  )

  indexedPoints.forEach((point, index) => {
    pointById.set(point.id, point)
    vertexIndexByPointId.set(point.id, index)
    pointIdGrid[point.iy][point.ix] = point.id
  })

  return {
    width: lonKeys.length,
    height: latKeys.length,
    points: indexedPoints,
    pointById,
    pointIdGrid,
    vertexIndexByPointId,
    lons: lonKeys,
    lats: latKeys,
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

      if (id00 < 0 || id10 < 0 || id01 < 0 || id11 < 0) continue

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

function sampleColor(stops: ColorStop[], value: number): [number, number, number] {
  if (value <= stops[0].value) return stops[0].color
  if (value >= stops[stops.length - 1].value) return stops[stops.length - 1].color

  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i]
    const b = stops[i + 1]

    if (value >= a.value && value <= b.value) {
      const t = (value - a.value) / (b.value - a.value || 1)
      return [
        Math.round(lerp(a.color[0], b.color[0], t)),
        Math.round(lerp(a.color[1], b.color[1], t)),
        Math.round(lerp(a.color[2], b.color[2], t)),
      ]
    }
  }

  return stops[stops.length - 1].color
}

function getCellValue(cell: WW3Cell | undefined, variable: VariableKey): number | null {
  if (!cell) return null
  return cell[variable] ?? null
}

function upscaleCanvas(canvas: HTMLCanvasElement, factor = 4) {
  const out = document.createElement('canvas')
  out.width = canvas.width * factor
  out.height = canvas.height * factor
  const ctx = out.getContext('2d')

  if (!ctx) return canvas

  ctx.imageSmoothingEnabled = true
  ctx.drawImage(canvas, 0, 0, out.width, out.height)

  return out
}

function buildVariableTexture(frame: WW3Frame, raster: RasterInfo, variable: VariableKey): string {
  const scale = COLOR_SCALES[variable]
  const canvas = document.createElement('canvas')
  canvas.width = raster.width
  canvas.height = raster.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return PLACEHOLDER_IMAGE

  const image = ctx.createImageData(raster.width, raster.height)

  for (const pointId of frame.activePointIds) {
    const point = raster.pointById.get(pointId)
    const cell = frame.cells[pointId]
    const value = getCellValue(cell, variable)

    if (!point || value === null) continue

    const [r, g, b] = sampleColor(scale, value)
    const x = point.ix
    const y = raster.height - 1 - point.iy
    const idx = (y * raster.width + x) * 4

    image.data[idx] = r
    image.data[idx + 1] = g
    image.data[idx + 2] = b
    image.data[idx + 3] = 255
  }

  ctx.putImageData(image, 0, 0)

  return upscaleCanvas(canvas, 4).toDataURL('image/png')
}

function buildShallowMask(frame: WW3Frame, raster: RasterInfo, hsGlobalMax: number): string {
  const width = raster.width
  const height = raster.height
  const values = new Float32Array(width * height)
  const filled = new Uint8Array(width * height)

  for (const pointId of frame.activePointIds) {
    const point = raster.pointById.get(pointId)
    const hs = frame.cells[pointId]?.hs
    if (!point || hs === null) continue

    const x = point.ix
    const y = height - 1 - point.iy
    const idx = y * width + x

    values[idx] = clamp(hs / Math.max(0.01, hsGlobalMax), 0, 1)
    filled[idx] = 1
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return PLACEHOLDER_IMAGE

  const image = ctx.createImageData(width, height)

  const getValue = (x: number, y: number) => {
    const xx = clamp(x, 0, width - 1)
    const yy = clamp(y, 0, height - 1)
    return values[yy * width + xx]
  }

  const isFilled = (x: number, y: number) => {
    const xx = clamp(x, 0, width - 1)
    const yy = clamp(y, 0, height - 1)
    return filled[yy * width + xx] === 1
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx1 = y * width + x
      if (!filled[idx1]) continue

      const c = getValue(x, y)
      const l = getValue(x - 1, y)
      const r = getValue(x + 1, y)
      const u = getValue(x, y - 1)
      const d = getValue(x, y + 1)

      const grad = Math.abs(r - l) + Math.abs(d - u)
      const shallowBase = Math.pow(1 - c, 1.06)
      const coastBoost = clamp(grad * 2.4, 0, 1)
      const neighborMissing =
        Number(!isFilled(x - 1, y)) +
        Number(!isFilled(x + 1, y)) +
        Number(!isFilled(x, y - 1)) +
        Number(!isFilled(x, y + 1))

      const edgeBoost = clamp(neighborMissing / 4, 0, 1)
      const mask = clamp(shallowBase * 0.9 + coastBoost * 0.85 + edgeBoost * 0.85, 0, 1)
      const px = idx1 * 4
      const v = Math.round(mask * 255)

      image.data[px] = v
      image.data[px + 1] = v
      image.data[px + 2] = v
      image.data[px + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)

  return upscaleCanvas(canvas, 4).toDataURL('image/png')
}

function formatNumber(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

function formatFrameLabel(ts: string) {
  if (!ts) return '—'
  const raw = ts.replace('T', ' ')
  const chunks = raw.split(' ')
  if (chunks.length < 2) return raw
  return chunks[1].slice(0, 5)
}

function destinationPoint(lon: number, lat: number, bearingDeg: number, distanceMeters: number) {
  const radius = 6378137
  const angularDistance = distanceMeters / radius
  const bearing = Cesium.Math.toRadians(bearingDeg)
  const lat1 = Cesium.Math.toRadians(lat)
  const lon1 = Cesium.Math.toRadians(lon)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  )

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    )

  return {
    lon: Cesium.Math.toDegrees(lon2),
    lat: Cesium.Math.toDegrees(lat2),
  }
}

function buildSample(frame: WW3Frame, point: WW3Point): SelectedSample {
  const cell = frame.cells[point.id]
  return {
    pointId: point.id,
    lon: point.lon,
    lat: point.lat,
    ts: frame.ts,
    hs: cell?.hs ?? null,
    tp: cell?.tp ?? null,
    dir: cell?.dir ?? null,
    phs0: cell?.phs0 ?? null,
    ptp0: cell?.ptp0 ?? null,
  }
}

function findNearestActivePoint(
  lon: number,
  lat: number,
  frame: WW3Frame,
  pointById: Map<number, WW3Point>
): WW3Point | null {
  let bestPoint: WW3Point | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  const cosLat = Math.cos(Cesium.Math.toRadians(lat))

  for (const pointId of frame.activePointIds) {
    const point = pointById.get(pointId)
    if (!point) continue

    const dx = (point.lon - lon) * cosLat
    const dy = point.lat - lat
    const distance = dx * dx + dy * dy

    if (distance < bestDistance) {
      bestDistance = distance
      bestPoint = point
    }
  }

  return bestPoint
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
  metadata: WW3Metadata,
  terrainByPointId: Map<number, number>
) {
  if (!topology.vertices.length) {
    throw new Error('WW3 surface has no vertices')
  }

  if (!topology.triangles.length) {
    throw new Error('WW3 surface has no triangles')
  }

  const { lon_min, lon_max, lat_min, lat_max } = metadata.bbox
  const positions = new Float64Array(topology.vertices.length * 3)
  const sts = new Float32Array(topology.vertices.length * 2)

  topology.vertices.forEach((vertex, index) => {
    const terrainHeight = terrainByPointId.get(vertex.id) ?? 0
    const finalHeight = terrainHeight + WW3_SURFACE_LIFT_M
    const cart = Cesium.Cartesian3.fromDegrees(vertex.lon, vertex.lat, finalHeight)

    positions[index * 3] = cart.x
    positions[index * 3 + 1] = cart.y
    positions[index * 3 + 2] = cart.z

    const u = (vertex.lon - lon_min) / Math.max(1e-9, lon_max - lon_min)
    const v = (vertex.lat - lat_min) / Math.max(1e-9, lat_max - lat_min)

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
        shallowMask: PLACEHOLDER_IMAGE,
        time: 0,
        dayBlend: 1,
        swellStrength: 0.12,
        foamStrength: 0.32,
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

export default function LaRochelleWaveView({ onBack }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const primitiveRef = useRef<Cesium.Primitive | null>(null)
  const materialRef = useRef<Cesium.Material | null>(null)
  const clickHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null)
  const preRenderRef = useRef<((scene: Cesium.Scene, time: Cesium.JulianDate) => void) | null>(null)
  const arrowEntitiesRef = useRef<Cesium.Entity[]>([])
  const texturesRef = useRef<PreparedFrameTextures[]>([])
  const pointsByIdRef = useRef<Map<number, WW3Point>>(new Map())
  const framesRef = useRef<WW3Frame[]>([])
  const frameTimesRef = useRef<Cesium.JulianDate[]>([])
  const rasterRef = useRef<RasterInfo | null>(null)
  const metadataRef = useRef<WW3Metadata | null>(null)
  const terrainByPointIdRef = useRef<Map<number, number>>(new Map())
  const currentFrameRef = useRef(0)

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showArrows, setShowArrows] = useState(false)
  const [showLegend, setShowLegend] = useState(true)
  const [selectedVariable, setSelectedVariable] = useState<VariableKey>('hs')
  const [currentFrame, setCurrentFrame] = useState(0)
  const [selectedSample, setSelectedSample] = useState<SelectedSample | null>(null)
  const [loadingText, setLoadingText] = useState('Chargement WW3...')
  const [errorText, setErrorText] = useState('')
  const [basemap, setBasemap] = useState<BasemapKey>('ion')

  const selectedVariableDef = useMemo(
    () => VARIABLES.find(v => v.key === selectedVariable) ?? VARIABLES[0],
    [selectedVariable]
  )

  useEffect(() => {
    currentFrameRef.current = currentFrame
  }, [currentFrame])

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
        viewer.scene.atmosphere.dynamicLighting = Cesium.DynamicAtmosphereLightingType.SUNLIGHT
        viewer.scene.highDynamicRange = true
        viewer.scene.postProcessStages.fxaa.enabled = true
        viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
        viewer.clock.shouldAnimate = false

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

        viewerRef.current = viewer
      } catch (error) {
        console.error(error)
        setErrorText('Impossible d’initialiser Cesium')
      }
    }

    initViewer()

    return () => {
      destroyed = true

      if (clickHandlerRef.current) {
        clickHandlerRef.current.destroy()
        clickHandlerRef.current = null
      }

      if (preRenderRef.current && viewerRef.current) {
        viewerRef.current.scene.preRender.removeEventListener(preRenderRef.current)
        preRenderRef.current = null
      }

      arrowEntitiesRef.current.forEach(entity => viewerRef.current?.entities.remove(entity))
      arrowEntitiesRef.current = []

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

    async function initDataAndSurface() {
      try {
        setLoadingText('Chargement des fichiers WW3...')

        const [gridRaw, framesRaw, metadataRaw] = await Promise.all([
          loadJson<any>('/data/ww3/lr_grid.json'),
          loadJson<any>('/data/ww3/lr_frames.json'),
          loadJson<WW3Metadata>('/data/ww3/lr_metadata.json'),
        ])

        if (cancelled) return

        const gridPoints = parseGrid(gridRaw)
        const raster = buildRasterInfo(gridPoints)
        const frames = parseFrames(framesRaw)
        const frameTimes = frames.map(frame => parseSimulationJulianDate(frame.ts))
        const metadata = metadataRaw
        const topology = buildTopologyFromRaster(raster)

        if (!topology.vertices.length || !topology.triangles.length) {
          throw new Error('WW3 topology generation failed')
        }

        pointsByIdRef.current = raster.pointById
        framesRef.current = frames
        frameTimesRef.current = frameTimes
        rasterRef.current = raster
        metadataRef.current = metadata

        setLoadingText('Préparation des textures WW3...')

        const preparedTextures: PreparedFrameTextures[] = frames.map(frame => ({
          variables: {
            hs: buildVariableTexture(frame, raster, 'hs'),
            tp: buildVariableTexture(frame, raster, 'tp'),
            dir: buildVariableTexture(frame, raster, 'dir'),
            phs0: buildVariableTexture(frame, raster, 'phs0'),
            ptp0: buildVariableTexture(frame, raster, 'ptp0'),
          },
          shallowMask: buildShallowMask(frame, raster, metadata.hs_global_max),
        }))

        if (cancelled) return

        texturesRef.current = preparedTextures

        while (!viewerRef.current && !cancelled) {
          await new Promise(resolve => setTimeout(resolve, 40))
        }

        if (cancelled || !viewerRef.current) return

        const viewer = viewerRef.current

        configureSimulationClock(viewer, frameTimes)

        setLoadingText('Calage sur le terrain 3D...')

        const terrainByPointId = await sampleTerrainForRaster(viewer, raster)
        if (cancelled) return

        terrainByPointIdRef.current = terrainByPointId

        const { primitive, material } = createSurfacePrimitive(
          viewer,
          topology,
          metadata,
          terrainByPointId
        )

        primitiveRef.current = primitive
        materialRef.current = material

        material.uniforms.image = preparedTextures[0].variables.hs
        material.uniforms.shallowMask = preparedTextures[0].shallowMask
        material.uniforms.dayBlend = computeDayBlend(
          frameTimes[0],
          metadata.center.lon,
          metadata.center.lat
        )

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(metadata.center.lon, metadata.center.lat, 24000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-58),
            roll: 0,
          },
          duration: 1.6,
        })

        const tick = () => {
          if (!materialRef.current) return
          materialRef.current.uniforms.time = performance.now() * 0.001
        }

        viewer.scene.preRender.addEventListener(tick)
        preRenderRef.current = tick

        const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

        clickHandler.setInputAction((movement: any) => {
          const frame = framesRef.current[currentFrameRef.current]
          const pointMap = pointsByIdRef.current
          if (!frame || pointMap.size === 0) return

          let cartesian: Cesium.Cartesian3 | undefined

          if (viewer.scene.pickPositionSupported) {
            cartesian = viewer.scene.pickPosition(movement.position)
          }

          if (!cartesian) {
            const ray = viewer.camera.getPickRay(movement.position)
            if (ray) {
              cartesian = viewer.scene.globe.pick(ray, viewer.scene)
            }
          }

          if (!cartesian) return

          const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
          const lon = Cesium.Math.toDegrees(cartographic.longitude)
          const lat = Cesium.Math.toDegrees(cartographic.latitude)

          const nearest = findNearestActivePoint(lon, lat, frame, pointMap)
          if (!nearest) return

          setSelectedSample(buildSample(frame, nearest))
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

        clickHandlerRef.current = clickHandler

        setIsReady(true)
        setLoadingText('')
      } catch (error) {
        console.error(error)
        setErrorText('Erreur au chargement WW3')
        setLoadingText('')
      }
    }

    initDataAndSurface()

    return () => {
      cancelled = true
    }
  }, [])

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
    const textures = texturesRef.current[currentFrame]
    const frameTime = frameTimesRef.current[currentFrame]
    const metadata = metadataRef.current

    if (!viewer || !material || !textures || !frameTime || !metadata) return

    material.uniforms.image = textures.variables[selectedVariable]
    material.uniforms.shallowMask = textures.shallowMask
    material.uniforms.dayBlend = computeDayBlend(frameTime, metadata.center.lon, metadata.center.lat)

    viewer.clock.currentTime = Cesium.JulianDate.clone(frameTime)
    viewer.clock.shouldAnimate = false
    viewer.scene.requestRender()
  }, [currentFrame, selectedVariable, isReady])

  useEffect(() => {
    if (!isReady || !selectedSample) return

    const frame = framesRef.current[currentFrame]
    const point = pointsByIdRef.current.get(selectedSample.pointId)
    if (!frame || !point) return

    setSelectedSample(buildSample(frame, point))
  }, [currentFrame, isReady])

  useEffect(() => {
    if (!isPlaying) return

    const frames = framesRef.current
    if (!frames.length) return

    const id = window.setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % frames.length)
    }, FRAME_PLAY_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [isPlaying])

  useEffect(() => {
    const viewer = viewerRef.current
    const raster = rasterRef.current
    const frame = framesRef.current[currentFrame]
    const metadata = metadataRef.current

    if (!viewer || !raster || !frame || !metadata) return

    arrowEntitiesRef.current.forEach(entity => viewer.entities.remove(entity))
    arrowEntitiesRef.current = []

    if (!showArrows) return

    const stride = Math.max(1, Math.round(Math.sqrt((raster.width * raster.height) / 180)))
    const newEntities: Cesium.Entity[] = []

    for (const pointId of frame.activePointIds) {
      const point = raster.pointById.get(pointId)
      const cell = frame.cells[pointId]
      if (!point || !cell) continue
      if (point.ix % stride !== 0 || point.iy % stride !== 0) continue
      if (cell.dir === null) continue

      const hs = cell.hs ?? 0.4
      const lengthMeters = metadata.resolution_m * (1.8 + clamp(hs, 0, 2.2) * 0.9)
      const end = destinationPoint(point.lon, point.lat, cell.dir, lengthMeters)

      const entity = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            point.lon,
            point.lat,
            (terrainByPointIdRef.current.get(point.id) ?? 0) + WW3_SURFACE_LIFT_M + 2,
            end.lon,
            end.lat,
            (terrainByPointIdRef.current.get(point.id) ?? 0) + WW3_SURFACE_LIFT_M + 2,
          ]),
          width: 1.8,
          material: new Cesium.PolylineArrowMaterialProperty(
            Cesium.Color.WHITE.withAlpha(0.78)
          ),
        },
      })

      newEntities.push(entity)
    }

    arrowEntitiesRef.current = newEntities
  }, [currentFrame, showArrows, isReady])

  const frames = framesRef.current
  const metadata = metadataRef.current
  const currentFrameData = frames[currentFrame]

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} className="map3d-container" />

      <button className="scene-back-btn" onClick={onBack}>
        ← Retour
      </button>

      <div
        style={{
          position: 'absolute',
          top: 132,
          left: 16,
          zIndex: 58,
          width: 180,
          borderRadius: 12,
          background: 'rgba(10, 10, 20, 0.9)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          padding: 10,
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            opacity: 0.85,
            marginBottom: 8,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          Fond de carte
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {BASEMAPS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setBasemap(item.key)}
              style={{
                borderRadius: 8,
                border:
                  basemap === item.key
                    ? '1px solid #378ADD'
                    : '1px solid rgba(255,255,255,0.12)',
                background:
                  basemap === item.key
                    ? 'rgba(55,138,221,0.22)'
                    : 'rgba(255,255,255,0.04)',
                color: '#fff',
                padding: '8px 10px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'left',
              }}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowLegend(v => !v)}
            style={{
              marginTop: 4,
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: '#fff',
              padding: '8px 10px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            {showLegend ? 'Masquer légende' : 'Afficher légende'}
          </button>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 55,
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: 16,
          background: 'rgba(10, 10, 20, 0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          padding: 16,
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
          {metadata?.project ?? 'La Rochelle — WW3'}
        </div>

        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>
          Surface WW3
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {VARIABLES.map(variable => {
            const active = variable.key === selectedVariable
            return (
              <button
                key={variable.key}
                type="button"
                onClick={() => setSelectedVariable(variable.key)}
                style={{
                  border: active ? '1px solid #378ADD' : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(55,138,221,0.22)' : 'rgba(255,255,255,0.04)',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {variable.label}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setIsPlaying(v => !v)}
            style={{
              border: 'none',
              borderRadius: 10,
              background: isPlaying ? '#c0392b' : '#378ADD',
              color: '#fff',
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 700,
              minWidth: 150,
            }}
          >
            {isPlaying ? '■ Stop animation' : '▶ Lancer animation'}
          </button>

          <button
            type="button"
            onClick={() => setShowArrows(v => !v)}
            style={{
              border: showArrows ? '1px solid #378ADD' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              background: showArrows ? 'rgba(55,138,221,0.18)' : 'rgba(255,255,255,0.04)',
              color: '#fff',
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Flèches {showArrows ? 'ON' : 'OFF'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {frames.map((frame, index) => {
            const active = index === currentFrame
            return (
              <button
                key={`${frame.ts}-${index}`}
                type="button"
                onClick={() => setCurrentFrame(index)}
                style={{
                  border: active ? '1px solid #378ADD' : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(55,138,221,0.18)' : 'rgba(255,255,255,0.04)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  fontWeight: active ? 800 : 600,
                  minWidth: 60,
                  fontSize: 12,
                }}
              >
                {formatFrameLabel(frame.ts)}
              </button>
            )
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          <div style={{ opacity: 0.72 }}>Variable</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>
            {selectedVariableDef.label} ({selectedVariableDef.unit})
          </div>

          <div style={{ opacity: 0.72 }}>Temps</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>
            {currentFrameData?.ts ?? '—'}
          </div>

          <div style={{ opacity: 0.72 }}>Hs max</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>
            {formatNumber(currentFrameData?.hsMax ?? null)} m
          </div>

          <div style={{ opacity: 0.72 }}>Hs moy</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>
            {formatNumber(currentFrameData?.hsMean ?? null)} m
          </div>

          <div style={{ opacity: 0.72 }}>Points actifs</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>
            {currentFrameData?.nActive ?? '—'}
          </div>

          <div style={{ opacity: 0.72 }}>Résolution</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>
            {metadata?.resolution_m ?? '—'} m
          </div>

          <div style={{ opacity: 0.72 }}>Surface</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>
            terrain + {WW3_SURFACE_LIFT_M.toFixed(1)} m
          </div>
        </div>

        {selectedSample && (
          <div
            style={{
              borderRadius: 12,
              background: 'rgba(255,255,255,0.05)',
              padding: 12,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Échantillon WW3</div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 7,
              }}
            >
              <div style={{ opacity: 0.72 }}>Lon</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>
                {selectedSample.lon.toFixed(5)}
              </div>

              <div style={{ opacity: 0.72 }}>Lat</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>
                {selectedSample.lat.toFixed(5)}
              </div>

              <div style={{ opacity: 0.72 }}>Hs</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>
                {formatNumber(selectedSample.hs)} m
              </div>

              <div style={{ opacity: 0.72 }}>Tp</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>
                {formatNumber(selectedSample.tp)} s
              </div>

              <div style={{ opacity: 0.72 }}>Dir</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>
                {formatNumber(selectedSample.dir, 0)} °
              </div>

              <div style={{ opacity: 0.72 }}>Hs houle 1</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>
                {formatNumber(selectedSample.phs0)} m
              </div>

              <div style={{ opacity: 0.72 }}>Tp houle 1</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>
                {formatNumber(selectedSample.ptp0)} s
              </div>
            </div>
          </div>
        )}
      </div>

      {showLegend && <WW3Legend key={selectedVariable} activeVar={selectedVariable} visible />}

      {(!isReady || loadingText) && !errorText && (
        <div className="map3d-loading">{loadingText || 'Chargement...'}</div>
      )}

      {errorText && <div className="map3d-loading">{errorText}</div>}
    </div>
  )
}