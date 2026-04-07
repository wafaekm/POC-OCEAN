import { useEffect, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  createWorldTerrainAsync,
  createOsmBuildingsAsync,
  IonImageryProvider,
  Cartesian3,
  Math as CesiumMath,
  Color,
  Cesium3DTileFeature,
  Cesium3DTileStyle,
  ShadowMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  HeightReference,
  ClassificationType,
  CustomDataSource,
  PolygonHierarchy,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D.css'

const MUNCIE = { lon: -85.3905, lat: 40.1934 }
const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

const STREET_KEYFRAMES = [
  { lon: -85.395, lat: 40.188, alt: 350, heading: 350, pitch: -28, duration: 2.5 },
  { lon: -85.392, lat: 40.191, alt: 100, heading: 350, pitch: -15, duration: 3.5 },
  { lon: -85.389, lat: 40.193, alt: 25, heading: 350, pitch: -8, duration: 4 },
  { lon: -85.386, lat: 40.195, alt: 8, heading: 10, pitch: -3, duration: 5 },
  { lon: -85.383, lat: 40.193, alt: 5, heading: 90, pitch: -2, duration: 5 },
  { lon: -85.380, lat: 40.193, alt: 4, heading: 180, pitch: 0, duration: 6 },
]

const FLOOD_FILES = [
  'frame_00.json',
  'frame_01.json',
  'frame_02.json',
  'frame_03.json',
  'frame_04.json',
  'frame_05.json',
  'frame_06.json',
  'frame_07.json',
  'frame_08.json',
  'frame_09.json',
]

interface BuildingInfo {
  name: string
  height: string
  type: string
  address: string
}

interface FloodCell {
  lon: number
  lat: number
  depth: number
  water_surface: number
  terrain_elevation: number
}

interface FloodFrame {
  frame_index: number
  source_time_raw_days: number
  source_time_hours: number
  flooded_cells: number
  cells: FloodCell[]
}

interface FloodBand {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
  rowCenter: number
  avgDepth: number
  count: number
}

interface FloodBlob {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
  depthSum: number
  count: number
  lastRowCenter: number
}

export default function Map3D() {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const handler = useRef<ScreenSpaceEventHandler | null>(null)
  const selectedBuilding = useRef<Cesium3DTileFeature | null>(null)
  const cameraTimeouts = useRef<ReturnType<typeof setTimeout>[]>([])
  const animFrameRef = useRef<number | null>(null)
  const floodDataSourceRef = useRef<CustomDataSource | null>(null)

  const [frames, setFrames] = useState<FloodFrame[]>([])
  const [currentFrame, setCurrentFrame] = useState(2)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isCinematic, setIsCinematic] = useState(false)
  const [buildingInfo, setBuildingInfo] = useState<BuildingInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [framesLoaded, setFramesLoaded] = useState(false)

  useEffect(() => {
    const loadFrames = async () => {
      try {
        const loaded = await Promise.all(
          FLOOD_FILES.map(f => fetch(`/data/flood_frames/${f}`).then(r => r.json()))
        )
        setFrames(loaded)
        setFramesLoaded(true)
      } catch (err) {
        console.warn('Flood frames loading error:', err)
      }
    }

    loadFrames()
  }, [])

  const clearWater = () => {
    const ds = floodDataSourceRef.current
    if (!ds) return
    ds.entities.removeAll()
  }

  const getFrameBounds = (cells: FloodCell[]) => {
    let minLon = Infinity
    let maxLon = -Infinity
    let minLat = Infinity
    let maxLat = -Infinity

    for (const cell of cells) {
      if (cell.lon < minLon) minLon = cell.lon
      if (cell.lon > maxLon) maxLon = cell.lon
      if (cell.lat < minLat) minLat = cell.lat
      if (cell.lat > maxLat) maxLat = cell.lat
    }

    return { minLon, maxLon, minLat, maxLat }
  }

  const estimateCellSizeDegrees = (cells: FloodCell[]) => {
    if (cells.length < 2) {
      return { dLon: 0.00008, dLat: 0.00008 }
    }

    const bounds = getFrameBounds(cells)
    const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.0001)
    const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001)

    const avgAreaPerCell = (lonSpan * latSpan) / cells.length
    const avgSize = Math.sqrt(avgAreaPerCell)
    const amplified = avgSize * 2.2

    return {
      dLon: Math.max(amplified, 0.00005),
      dLat: Math.max(amplified, 0.00005),
    }
  }

  const buildBandPolygon = (minLon: number, maxLon: number, minLat: number, maxLat: number) => {
    return Cartesian3.fromDegreesArray([
      minLon, minLat,
      maxLon, minLat,
      maxLon, maxLat,
      minLon, maxLat,
    ])
  }

  const overlapRatio = (aMin: number, aMax: number, bMin: number, bMax: number) => {
    const overlap = Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin))
    const minWidth = Math.min(aMax - aMin, bMax - bMin)
    if (minWidth <= 0) return 0
    return overlap / minWidth
  }

  const buildFloodBands = (cells: FloodCell[]) => {
    if (!cells.length) return { bands: [], rowStep: 0.00008 }

    const { dLon, dLat } = estimateCellSizeDegrees(cells)
    const rowStep = dLat * 0.8
    const mergeGap = dLon * 1.35
    const overlapLon = dLon * 0.6
    const overlapLat = dLat * 0.6

    const rows = new Map<number, FloodCell[]>()

    for (const cell of cells) {
      const rowKey = Math.round(cell.lat / rowStep)
      const existing = rows.get(rowKey)
      if (existing) existing.push(cell)
      else rows.set(rowKey, [cell])
    }

    const bands: FloodBand[] = []

    for (const rowCells of rows.values()) {
      rowCells.sort((a, b) => a.lon - b.lon)

      let currentStart = rowCells[0].lon
      let currentEnd = rowCells[0].lon
      let depthSum = rowCells[0].depth
      let count = 1
      let latSum = rowCells[0].lat

      for (let i = 1; i < rowCells.length; i++) {
        const cell = rowCells[i]
        const prev = rowCells[i - 1]

        if (cell.lon - prev.lon <= mergeGap) {
          currentEnd = cell.lon
          depthSum += cell.depth
          latSum += cell.lat
          count += 1
        } else {
          const avgLat = latSum / count
          bands.push({
            minLon: currentStart - overlapLon,
            maxLon: currentEnd + overlapLon,
            minLat: avgLat - overlapLat,
            maxLat: avgLat + overlapLat,
            rowCenter: avgLat,
            avgDepth: depthSum / count,
            count,
          })

          currentStart = cell.lon
          currentEnd = cell.lon
          depthSum = cell.depth
          latSum = cell.lat
          count = 1
        }
      }

      const avgLat = latSum / count
      bands.push({
        minLon: currentStart - overlapLon,
        maxLon: currentEnd + overlapLon,
        minLat: avgLat - overlapLat,
        maxLat: avgLat + overlapLat,
        rowCenter: avgLat,
        avgDepth: depthSum / count,
        count,
      })
    }

    return { bands, rowStep }
  }

  const buildFloodBlobs = (bands: FloodBand[], rowStep: number) => {
    if (!bands.length) return []

    const sortedBands = [...bands].sort((a, b) => {
      if (a.rowCenter !== b.rowCenter) return a.rowCenter - b.rowCenter
      return a.minLon - b.minLon
    })

    const blobs: FloodBlob[] = []
    const maxVerticalGap = rowStep * 1.6
    const minOverlap = 0.22

    for (const band of sortedBands) {
      let bestBlobIndex = -1
      let bestScore = -1

      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i]
        const verticalGap = band.minLat - blob.maxLat

        if (verticalGap > maxVerticalGap) continue
        if (verticalGap < -rowStep * 0.3) continue

        const score = overlapRatio(
          band.minLon,
          band.maxLon,
          blob.minLon,
          blob.maxLon
        )

        if (score >= minOverlap && score > bestScore) {
          bestScore = score
          bestBlobIndex = i
        }
      }

      if (bestBlobIndex >= 0) {
        const blob = blobs[bestBlobIndex]
        blob.minLon = Math.min(blob.minLon, band.minLon)
        blob.maxLon = Math.max(blob.maxLon, band.maxLon)
        blob.minLat = Math.min(blob.minLat, band.minLat)
        blob.maxLat = Math.max(blob.maxLat, band.maxLat)
        blob.depthSum += band.avgDepth * band.count
        blob.count += band.count
        blob.lastRowCenter = band.rowCenter
      } else {
        blobs.push({
          minLon: band.minLon,
          maxLon: band.maxLon,
          minLat: band.minLat,
          maxLat: band.maxLat,
          depthSum: band.avgDepth * band.count,
          count: band.count,
          lastRowCenter: band.rowCenter,
        })
      }
    }

    return blobs
  }

  const getWaterMaterial = (avgDepth: number) => {
    const depth = Math.max(0, Math.min(avgDepth, 4))
    const t = depth / 4

    const r = Math.round(55 + t * 18)
    const g = Math.round(120 + t * 24)
    const b = Math.round(185 + t * 20)
    const a = 0.24 + t * 0.16

    return Color.fromBytes(r, g, b).withAlpha(a)
  }

  const renderFloodFrame = (frame: FloodFrame) => {
    const ds = floodDataSourceRef.current
    if (!ds) return

    clearWater()

    const cells = frame.cells ?? []
    if (!cells.length) return

    const { bands, rowStep } = buildFloodBands(cells)
    const blobs = buildFloodBlobs(bands, rowStep)

    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i]
      const avgDepth = blob.depthSum / blob.count
      const positions = buildBandPolygon(blob.minLon, blob.maxLon, blob.minLat, blob.maxLat)

      ds.entities.add({
        id: `flood-blob-${frame.frame_index}-${i}`,
        polygon: {
          hierarchy: new PolygonHierarchy(positions),
          material: getWaterMaterial(avgDepth),
          height: 0,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          classificationType: ClassificationType.BOTH,
          outline: false,
          perPositionHeight: false,
        },
      })

      ds.entities.add({
        id: `flood-blob-soft-${frame.frame_index}-${i}`,
        polygon: {
          hierarchy: new PolygonHierarchy(positions),
          material: Color.fromBytes(120, 190, 235).withAlpha(0.05),
          height: 0,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          classificationType: ClassificationType.BOTH,
          outline: false,
          perPositionHeight: false,
        },
      })
    }

    viewer.current?.scene.requestRender()
  }

  useEffect(() => {
    if (!framesLoaded || frames.length === 0) return
    const frame = frames[currentFrame]
    if (!frame) return
    renderFloodFrame(frame)
  }, [currentFrame, framesLoaded, frames])

  useEffect(() => {
    if (viewer.current || !cesiumContainer.current) return

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
          requestRenderMode: true,
          maximumRenderTimeChange: 0.1,
        })

        viewer.current = v

        v.imageryLayers.removeAll()
        v.imageryLayers.addImageryProvider(await IonImageryProvider.fromAssetId(2))

        v.scene.logarithmicDepthBuffer = true
        v.scene.globe.depthTestAgainstTerrain = true
        v.scene.globe.enableLighting = true
        v.scene.globe.showGroundAtmosphere = true
        v.scene.postProcessStages.fxaa.enabled = true
        v.scene.screenSpaceCameraController.minimumZoomDistance = 2
        v.scene.screenSpaceCameraController.maximumZoomDistance = 8000

        const floodDs = new CustomDataSource('flood-layer')
        floodDataSourceRef.current = floodDs
        await v.dataSources.add(floodDs)

        try {
          const buildings = await createOsmBuildingsAsync({
            style: new Cesium3DTileStyle({
              color: "mix(color('#d9d4cc'), color('#f3eee8'), 0.35)",
            }),
          })
          buildings.shadows = ShadowMode.DISABLED
          buildings.maximumScreenSpaceError = 16
          v.scene.primitives.add(buildings)

          handler.current = new ScreenSpaceEventHandler(v.scene.canvas)

          handler.current.setInputAction((mv: any) => {
            const picked = v.scene.pick(mv.endPosition)
            v.scene.canvas.style.cursor =
              defined(picked) && picked instanceof Cesium3DTileFeature ? 'pointer' : 'default'
          }, ScreenSpaceEventType.MOUSE_MOVE)

          handler.current.setInputAction((click: any) => {
            const picked = v.scene.pick(click.position)

            if (selectedBuilding.current) {
              selectedBuilding.current.color = Color.fromCssColorString('#f2ede8')
              selectedBuilding.current = null
            }

            if (defined(picked) && picked instanceof Cesium3DTileFeature) {
              picked.color = Color.fromCssColorString('#4a9eff')
              selectedBuilding.current = picked

              const name =
                picked.getProperty('name') ||
                picked.getProperty('addr:housename') ||
                'Bâtiment'

              const rawH =
                picked.getProperty('cesium#estimatedHeight') ||
                picked.getProperty('height')

              const height = rawH ? `${parseFloat(rawH).toFixed(1)}m` : 'N/A'
              const type = picked.getProperty('building') || 'N/A'
              const street = picked.getProperty('addr:street') || ''
              const num = picked.getProperty('addr:housenumber') || ''

              setBuildingInfo({
                name,
                height,
                type,
                address: street ? `${num} ${street}`.trim() : 'N/A',
              })
            } else {
              setBuildingInfo(null)
            }
          }, ScreenSpaceEventType.LEFT_CLICK)
        } catch (err) {
          console.warn('OSM buildings error:', err)
        }

        v.camera.flyTo({
          destination: Cartesian3.fromDegrees(
            MUNCIE.lon,
            MUNCIE.lat - 0.02,
            500
          ),
          orientation: {
            heading: CesiumMath.toRadians(0),
            pitch: CesiumMath.toRadians(-22),
            roll: 0,
          },
          duration: 2.5,
        })

        setTimeout(() => {
          if (!destroyed) setIsLoading(false)
        }, 2500)
      } catch (err) {
        console.error('Cesium init error:', err)
        if (!destroyed) setIsLoading(false)
      }
    }

    init()

    return () => {
      destroyed = true
      handler.current?.destroy()
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      cameraTimeouts.current.forEach(clearTimeout)
      clearWater()
      if (viewer.current) {
        viewer.current.destroy()
        viewer.current = null
      }
    }
  }, [])

  const zoomToFloodFrame = (frame: FloodFrame) => {
    const v = viewer.current
    const cells = frame?.cells ?? []
    if (!v || !cells.length) return

    const bounds = getFrameBounds(cells)

    v.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        (bounds.minLon + bounds.maxLon) * 0.5,
        (bounds.minLat + bounds.maxLat) * 0.5,
        900
      ),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-70),
        roll: 0,
      },
      duration: 1.2,
    })
  }

  const startStreetCinematic = () => {
    const v = viewer.current
    if (!v) return

    cameraTimeouts.current.forEach(clearTimeout)
    cameraTimeouts.current = []

    let cumTime = 0
    STREET_KEYFRAMES.forEach(frame => {
      const t = setTimeout(() => {
        v.camera.flyTo({
          destination: Cartesian3.fromDegrees(frame.lon, frame.lat, frame.alt),
          orientation: {
            heading: CesiumMath.toRadians(frame.heading),
            pitch: CesiumMath.toRadians(frame.pitch),
            roll: 0,
          },
          duration: frame.duration,
        })
      }, cumTime * 1000)

      cameraTimeouts.current.push(t)
      cumTime += frame.duration + 0.2
    })
  }

  const animateFlood = () => {
    if (isAnimating) {
      cameraTimeouts.current.forEach(clearTimeout)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      setIsAnimating(false)
      setIsCinematic(false)
      setCurrentFrame(2)
      clearWater()
      return
    }

    if (!framesLoaded || frames.length === 0) {
      console.warn('Frames not loaded yet')
      return
    }

    setIsAnimating(true)
    setIsCinematic(true)
    setCurrentFrame(0)
    startStreetCinematic()

    const frameDuration = 2000
    let frameIndex = 0

    const showNextFrame = () => {
      if (frameIndex >= frames.length) {
        setIsAnimating(false)
        setIsCinematic(false)
        return
      }

      const frame = frames[frameIndex]
      zoomToFloodFrame(frame)
      setCurrentFrame(frameIndex)

      frameIndex += 1
      const t = setTimeout(showNextFrame, frameDuration)
      cameraTimeouts.current.push(t)
    }

    showNextFrame()
  }

  const handleManualLevel = (level: number) => {
  cameraTimeouts.current.forEach(clearTimeout)
  if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
  setIsAnimating(false)

  if (!framesLoaded || frames.length === 0) {
    clearWater()
    return
  }

  const frameIndex = Math.min(
    Math.max(Math.round(level), 0),
    frames.length - 1
  )

  setCurrentFrame(frameIndex)  // ← plus de zoomToFloodFrame ici
}

  const activeColor =
    currentFrame < 3 ? '#378ADD' :
    currentFrame < 6 ? '#EF9F27' :
    currentFrame < 8 ? '#E8593C' :
    '#E24B4A'

  const currentProps = frames[currentFrame]

  return (
    <div className="map3d-wrapper">
      <div ref={cesiumContainer} className="map3d-container" />

      {isLoading && (
        <div className="map3d-loading">Chargement Muncie...</div>
      )}

      <div className="simulation-panel">
        <div className="simulation-title">Simulation submersion</div>
        <div className="simulation-subtitle">
          {framesLoaded ? '✅ Données HEC-RAS chargées' : '⏳ Chargement données...'}
        </div>

        <div className="sim-slider-row">
          <span className="sim-label">Frame</span>
          <input
            type="range"
            min={0}
            max={Math.max(frames.length - 1, 0)}
            step={1}
            value={currentFrame}
            onChange={e => handleManualLevel(parseInt(e.target.value, 10))}
            className="sim-slider"
          />
          <span className="sim-value" style={{ color: activeColor }}>
            {currentFrame + 1}
          </span>
        </div>

        <div className="sim-scenarios">
          {[
            { label: 'Début', value: 0 },
            { label: 'Montée', value: 3 },
            { label: 'Pic', value: 6 },
            { label: 'Max', value: 9 },
          ].map(s => (
            <button
              key={s.value}
              className={`sim-btn ${currentFrame === s.value ? 'active' : ''}`}
              onClick={() => handleManualLevel(Math.min(s.value, Math.max(frames.length - 1, 0)))}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          className={`sim-animate-btn ${isAnimating ? 'stop' : ''}`}
          onClick={animateFlood}
          disabled={!framesLoaded}
        >
          {!framesLoaded ? '⏳ Chargement...'
            : isAnimating ? '⏹ Arrêter'
            : '▶ Lancer simulation HEC-RAS'}
        </button>

        {isCinematic && (
          <div className="sim-cinematic-badge">
            🎥 Vue street level active
          </div>
        )}

        {currentProps && (
          <div className="sim-frame-info">
            Frame {currentFrame + 1}/{frames.length} —
            t={currentProps.source_time_hours?.toFixed(2)}h —
            {currentProps.flooded_cells} cellules
          </div>
        )}

        {currentProps && (
          <div className="sim-info" style={{ borderColor: activeColor }}>
            <span style={{ color: activeColor, fontWeight: 600 }}>
              {currentProps.flooded_cells} cellules inondées
            </span>
            <span style={{ color: '#888', fontSize: 11 }}>
              {' '}— {currentProps.source_time_hours.toFixed(2)} h
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
                if (selectedBuilding.current) {
                  selectedBuilding.current.color = Color.fromCssColorString('#f2ede8')
                  selectedBuilding.current = null
                }
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
    </div>
  )
}