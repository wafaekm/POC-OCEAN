import fs from 'node:fs/promises'
import path from 'node:path'

const baseDir = path.resolve('public/data/ww3')
const gridPath = path.join(baseDir, 'lr_grid.json')
const framesPath = path.join(baseDir, 'lr_frames.json')
const metadataPath = path.join(baseDir, 'lr_metadata.json')

const topologyOutPath = path.join(baseDir, 'lr_mesh_topology.json')
const framesOutPath = path.join(baseDir, 'lr_mesh_frames.json')
const metadataOutPath = path.join(baseDir, 'lr_mesh_metadata.json')

const roundCoord = value => Number(value).toFixed(6)

const toUtcMs = ts => {
  const iso = String(ts).replace(' ', 'T') + 'Z'
  return Date.parse(iso)
}

const degreesToLocalMeters = (lon, lat, centerLon, centerLat) => {
  const metersPerDegLat = 111320
  const metersPerDegLon = Math.cos((centerLat * Math.PI) / 180) * 111320

  return {
    x: (lon - centerLon) * metersPerDegLon,
    y: (lat - centerLat) * metersPerDegLat,
  }
}

const getCellTp = cell => {
  const value = cell?.tp ?? cell?.ptp0
  return Number.isFinite(value) ? value : 0
}

const getCellDir = cell => {
  const value = cell?.dir ?? cell?.pdir0 ?? cell?.pd0
  return Number.isFinite(value) ? value : 0
}

const main = async () => {
  const [gridRaw, framesRaw, metadataRaw] = await Promise.all([
    fs.readFile(gridPath, 'utf8').then(JSON.parse),
    fs.readFile(framesPath, 'utf8').then(JSON.parse),
    fs.readFile(metadataPath, 'utf8').then(JSON.parse),
  ])

  const points = Array.isArray(gridRaw?.points) ? gridRaw.points : []
  const frames = Array.isArray(framesRaw?.frames) ? framesRaw.frames : []

  if (!points.length) {
    throw new Error('lr_grid.json: no points found')
  }

  if (!frames.length) {
    throw new Error('lr_frames.json: no frames found')
  }

  const sortedPoints = [...points].sort((a, b) => a.id - b.id)

  const pointIds = sortedPoints.map(p => p.id)
  const pointIdToVertexIndex = new Map()
  const pointIdToLonLat = new Map()

  sortedPoints.forEach((p, index) => {
    pointIdToVertexIndex.set(p.id, index)
    pointIdToLonLat.set(p.id, [p.lon, p.lat])
  })

  const uniqueLons = [...new Set(sortedPoints.map(p => roundCoord(p.lon)))].map(Number).sort((a, b) => a - b)
  const uniqueLats = [...new Set(sortedPoints.map(p => roundCoord(p.lat)))].map(Number).sort((a, b) => a - b)

  const gridLookup = new Map()

  for (const p of sortedPoints) {
    gridLookup.set(`${roundCoord(p.lon)}|${roundCoord(p.lat)}`, p.id)
  }

  const triangles = []

  for (let ix = 0; ix < uniqueLons.length - 1; ix += 1) {
    for (let iy = 0; iy < uniqueLats.length - 1; iy += 1) {
      const lon0 = uniqueLons[ix]
      const lon1 = uniqueLons[ix + 1]
      const lat0 = uniqueLats[iy]
      const lat1 = uniqueLats[iy + 1]

      const p00 = gridLookup.get(`${roundCoord(lon0)}|${roundCoord(lat0)}`)
      const p10 = gridLookup.get(`${roundCoord(lon1)}|${roundCoord(lat0)}`)
      const p01 = gridLookup.get(`${roundCoord(lon0)}|${roundCoord(lat1)}`)
      const p11 = gridLookup.get(`${roundCoord(lon1)}|${roundCoord(lat1)}`)

      if (
        p00 == null ||
        p10 == null ||
        p01 == null ||
        p11 == null
      ) {
        continue
      }

      const v00 = pointIdToVertexIndex.get(p00)
      const v10 = pointIdToVertexIndex.get(p10)
      const v01 = pointIdToVertexIndex.get(p01)
      const v11 = pointIdToVertexIndex.get(p11)

      if (
        v00 == null ||
        v10 == null ||
        v01 == null ||
        v11 == null
      ) {
        continue
      }

      triangles.push([v00, v10, v11])
      triangles.push([v00, v11, v01])
    }
  }

  const centerLon = metadataRaw?.center?.lon ?? (metadataRaw?.bbox?.lon_min + metadataRaw?.bbox?.lon_max) * 0.5
  const centerLat = metadataRaw?.center?.lat ?? (metadataRaw?.bbox?.lat_min + metadataRaw?.bbox?.lat_max) * 0.5

  const verticesLonLat = sortedPoints.map(p => [p.lon, p.lat])
  const vertexLocalXM = []
  const vertexLocalYM = []

  for (const p of sortedPoints) {
    const local = degreesToLocalMeters(p.lon, p.lat, centerLon, centerLat)
    vertexLocalXM.push(local.x)
    vertexLocalYM.push(local.y)
  }

  const topology = {
    version: 1,
    project: metadataRaw?.project ?? 'La Rochelle WW3',
    crs: metadataRaw?.crs ?? 'WGS84',
    units: 'meters',
    vertex_count: verticesLonLat.length,
    triangle_count: triangles.length,
    point_count: sortedPoints.length,
    bbox: metadataRaw?.bbox,
    center: metadataRaw?.center,
    vertices_lonlat: verticesLonLat,
    vertex_local_x_m: vertexLocalXM,
    vertex_local_y_m: vertexLocalYM,
    triangles,
  }

  const firstMs = toUtcMs(frames[0].ts)

  const meshFrames = frames.map((frame, frameIndex) => {
    const cells = frame?.cells ?? {}
    const activeVertexIds = []
    const activeSet = new Set()

    const vertexHs = new Float32Array(sortedPoints.length)
    const vertexTp = new Float32Array(sortedPoints.length)
    const vertexDirDeg = new Float32Array(sortedPoints.length)

    for (let i = 0; i < sortedPoints.length; i += 1) {
      const pointId = sortedPoints[i].id
      const cell = cells[String(pointId)] ?? cells[pointId]

      if (!cell) {
        vertexHs[i] = 0
        vertexTp[i] = 0
        vertexDirDeg[i] = 0
        continue
      }

      activeVertexIds.push(i)
      activeSet.add(i)

      vertexHs[i] = Number.isFinite(cell.hs) ? cell.hs : 0
      vertexTp[i] = getCellTp(cell)
      vertexDirDeg[i] = getCellDir(cell)
    }

    const activeTriangleIds = []

    for (let triId = 0; triId < triangles.length; triId += 1) {
      const tri = triangles[triId]
      if (
        activeSet.has(tri[0]) &&
        activeSet.has(tri[1]) &&
        activeSet.has(tri[2])
      ) {
        activeTriangleIds.push(triId)
      }
    }

    const ms = toUtcMs(frame.ts)
    const tHours = Number.isFinite(ms) && Number.isFinite(firstMs)
      ? (ms - firstMs) / 3600000
      : frameIndex * 3

    return {
      t: tHours,
      ts: frame.ts,
      n_active: frame.n_active ?? activeVertexIds.length,
      hs_max: frame.hs_max ?? 0,
      hs_mean: frame.hs_mean ?? 0,
      active_vertex_ids: activeVertexIds,
      active_triangle_ids: activeTriangleIds,
      vertex_hs: Array.from(vertexHs),
      vertex_tp: Array.from(vertexTp),
      vertex_dir_deg: Array.from(vertexDirDeg),
    }
  })

  const meshMetadata = {
    version: 1,
    project: metadataRaw?.project ?? 'La Rochelle WW3',
    date: metadataRaw?.date ?? '',
    bbox: metadataRaw?.bbox,
    center: metadataRaw?.center,
    n_points: metadataRaw?.n_points ?? sortedPoints.length,
    n_frames: metadataRaw?.n_frames ?? meshFrames.length,
    timesteps: metadataRaw?.timesteps ?? meshFrames.map(f => f.ts),
    hs_global_max: metadataRaw?.hs_global_max ?? Math.max(...meshFrames.map(f => f.hs_max)),
    resolution_m: metadataRaw?.resolution_m ?? 200,
    crs: metadataRaw?.crs ?? 'WGS84',
    triangle_count: triangles.length,
    vertex_count: sortedPoints.length,
  }

  await Promise.all([
    fs.writeFile(topologyOutPath, JSON.stringify(topology)),
    fs.writeFile(framesOutPath, JSON.stringify({
      version: 1,
      frame_count: meshFrames.length,
      frames: meshFrames,
    })),
    fs.writeFile(metadataOutPath, JSON.stringify(meshMetadata, null, 2)),
  ])

  console.log(JSON.stringify({
    ok: true,
    vertices: topology.vertex_count,
    triangles: topology.triangle_count,
    frames: meshFrames.length,
    output: {
      topology: topologyOutPath,
      frames: framesOutPath,
      metadata: metadataOutPath,
    },
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})