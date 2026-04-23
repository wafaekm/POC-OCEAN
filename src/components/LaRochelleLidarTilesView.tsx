import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  IonImageryProvider,
  Cesium3DTileset,
  Cesium3DTileStyle,
  ShadowMode,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  PointCloudShading,
  Cartographic,
  Cartesian3,
  Math as CesiumMath,
  Color,
  LabelStyle,
  Cartesian2,
  HeadingPitchRange,
  ClippingPlaneCollection,
  ClippingPlane,
  Transforms,
  BoundingSphere,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D/Map3D.css'

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN
const ASSET_IDS = [4627426, 4627452, 4632107, 4632061, 4631249, 4631231]
const BOOKMARKS_KEY = 'la-rochelle-lidar-bookmarks-v2'

interface Props {
  onBack: () => void
}

type ColorMode = 'classification' | 'intensity' | 'original'
type InteractionMode = 'inspect' | 'distance' | 'height'

type Bookmark = {
  id: string
  name: string
  destination: {
    x: number
    y: number
    z: number
  }
  orientation: {
    heading: number
    pitch: number
    roll: number
  }
}

export default function LaRochelleLidarTilesView({ onBack }: Props) {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const tilesetsRef = useRef<Record<number, Cesium3DTileset | null>>({})
  const clippingRefs = useRef<Record<number, ClippingPlaneCollection | null>>({})
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const measureStartRef = useRef<Cartesian3 | null>(null)
  const tempMeasureEntityRef = useRef<any>(null)
  const measureEntitiesRef = useRef<any[]>([])
  const interactionModeRef = useRef<InteractionMode>('inspect')

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('classification')
  const [visibleAssets, setVisibleAssets] = useState<Record<number, boolean>>(
    () => Object.fromEntries(ASSET_IDS.map(assetId => [assetId, true])) as Record<number, boolean>,
  )
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('inspect')
  const [pointSize, setPointSize] = useState(2)
  const [attenuation, setAttenuation] = useState(true)
  const [eyeDomeLighting, setEyeDomeLighting] = useState(true)
  const [showFps, setShowFps] = useState(false)
  const [resolutionScale, setResolutionScale] = useState(1)
  const [clipEnabled, setClipEnabled] = useState(false)
  const [clipDistance, setClipDistance] = useState(0)
  const [infoText, setInfoText] = useState('Clique sur un point pour inspecter ses coordonnées et ses propriétés.')
  const [statusText, setStatusText] = useState('Chargement LiDAR 3D Tiles...')
  const [bookmarkName, setBookmarkName] = useState('')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const visibleCount = useMemo(
    () => ASSET_IDS.filter(assetId => visibleAssets[assetId]).length,
    [visibleAssets],
  )

  const requestRender = () => {
    viewerRef.current?.scene.requestRender()
  }

  const formatMeters = (value: number) => {
    if (!Number.isFinite(value)) return '-'
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(3)} km`
    return `${value.toFixed(3)} m`
  }

  const formatDegrees = (value: number) => CesiumMath.toDegrees(value).toFixed(7)

  const getTilesets = () => {
    return ASSET_IDS.map(assetId => tilesetsRef.current[assetId]).filter(Boolean) as Cesium3DTileset[]
  }

  const getVisibleTilesets = () => {
    return ASSET_IDS.filter(assetId => visibleAssets[assetId])
      .map(assetId => tilesetsRef.current[assetId])
      .filter(Boolean) as Cesium3DTileset[]
  }

  const getCombinedBoundingSphere = () => {
    const visibleTilesets = getVisibleTilesets()
    if (visibleTilesets.length === 0) return null
    if (visibleTilesets.length === 1) return visibleTilesets[0].boundingSphere
    return BoundingSphere.fromBoundingSpheres(visibleTilesets.map(tileset => tileset.boundingSphere))
  }

  const flyToVisibleTilesets = (preset: 'fit' | 'oblique' | 'top' | 'north' | 'south' = 'fit') => {
    const viewer = viewerRef.current
    const sphere = getCombinedBoundingSphere()

    if (!viewer || !sphere) return

    const rangeBase = Math.max(sphere.radius * 2.2, 35)
    const presetOffset = {
      fit: new HeadingPitchRange(CesiumMath.toRadians(30), CesiumMath.toRadians(-28), rangeBase),
      oblique: new HeadingPitchRange(CesiumMath.toRadians(20), CesiumMath.toRadians(-32), rangeBase),
      top: new HeadingPitchRange(0, CesiumMath.toRadians(-89), rangeBase * 0.9),
      north: new HeadingPitchRange(0, CesiumMath.toRadians(-18), rangeBase),
      south: new HeadingPitchRange(CesiumMath.PI, CesiumMath.toRadians(-18), rangeBase),
    }[preset]

    viewer.camera.flyToBoundingSphere(sphere, {
      duration: 1.2,
      offset: presetOffset,
    })
  }

  const applyStyle = (tileset: Cesium3DTileset | null, mode: ColorMode, nextPointSize: number) => {
    if (!tileset) return

    if (mode === 'original') {
      tileset.style = new Cesium3DTileStyle({
        pointSize: `${nextPointSize}`,
      })
      return
    }

    if (mode === 'classification') {
      tileset.style = new Cesium3DTileStyle({
        color: {
          conditions: [
            ["${Classification} === 2", "color('#b88a5a')"],
            ["${Classification} === 3", "color('#b8e186')"],
            ["${Classification} === 4", "color('#66bd63')"],
            ["${Classification} === 5", "color('#1a9850')"],
            ["${Classification} === 6", "color('#94a3b8')"],
            ["${Classification} === 9", "color('#4f9bff')"],
            ["${Classification} === 17", "color('#8e63ff')"],
            ["${Classification} === 1", "color('#d9d9d9')"],
            ["true", "color('#ffffff')"],
          ],
        },
        pointSize: `${nextPointSize}`,
      })
      return
    }

    tileset.style = new Cesium3DTileStyle({
      color: {
        conditions: [
          ["${Intensity} >= 220", "color('#fff7bc')"],
          ["${Intensity} >= 180", "color('#fec44f')"],
          ["${Intensity} >= 140", "color('#7fcdbb')"],
          ["${Intensity} >= 100", "color('#41b6c4')"],
          ["${Intensity} >= 60", "color('#2c7fb8')"],
          ["true", "color('#253494')"],
        ],
      },
      pointSize: `${nextPointSize}`,
    })
  }

  const applyPointCloudShading = (tileset: Cesium3DTileset | null) => {
    if (!tileset) return

    tileset.pointCloudShading = new PointCloudShading({
      attenuation,
      eyeDomeLighting,
      eyeDomeLightingStrength: 1.0,
      eyeDomeLightingRadius: 1.2,
      maximumAttenuation: 4,
    })
  }

  const applyClippingToTileset = (assetId: number, tileset: Cesium3DTileset | null) => {
    if (!tileset) return

    if (!clippingRefs.current[assetId]) {
      clippingRefs.current[assetId] = new ClippingPlaneCollection({
        planes: [new ClippingPlane(new Cartesian3(1, 0, 0), 0)],
        enabled: clipEnabled,
        edgeWidth: 1,
        edgeColor: Color.WHITE,
        modelMatrix: Transforms.eastNorthUpToFixedFrame(tileset.boundingSphere.center),
      })
      tileset.clippingPlanes = clippingRefs.current[assetId]
    }

    clippingRefs.current[assetId]!.enabled = clipEnabled
    clippingRefs.current[assetId]!.get(0).distance = clipDistance
  }

  const clearMeasurements = () => {
    const viewer = viewerRef.current
    if (!viewer) return

    measureStartRef.current = null

    if (tempMeasureEntityRef.current) {
      viewer.entities.remove(tempMeasureEntityRef.current)
      tempMeasureEntityRef.current = null
    }

    measureEntitiesRef.current.forEach(entity => viewer.entities.remove(entity))
    measureEntitiesRef.current = []

    setStatusText('Mesures effacées')
    requestRender()
  }

  const addMeasurePoint = (position: Cartesian3) => {
    const viewer = viewerRef.current
    if (!viewer) return

    const entity = viewer.entities.add({
      position,
      point: {
        pixelSize: 10,
        color: Color.YELLOW,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
      },
    })

    measureEntitiesRef.current.push(entity)
  }

  const addMeasureLine = (positions: Cartesian3[]) => {
    const viewer = viewerRef.current
    if (!viewer) return

    const entity = viewer.entities.add({
      polyline: {
        positions,
        width: 3,
        material: Color.YELLOW,
      },
    })

    measureEntitiesRef.current.push(entity)
  }

  const addMeasureLabel = (position: Cartesian3, text: string) => {
    const viewer = viewerRef.current
    if (!viewer) return

    const entity = viewer.entities.add({
      position,
      label: {
        text,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#111827'),
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        font: '14px sans-serif',
        pixelOffset: new Cartesian2(0, -18),
      },
    })

    measureEntitiesRef.current.push(entity)
  }

  const getPickedCartesian = (position: { x: number; y: number }) => {
    const viewer = viewerRef.current
    if (!viewer) return null
    if (!viewer.scene.pickPositionSupported) return null

    try {
      return viewer.scene.pickPosition(position)
    } catch {
      return null
    }
  }

  const updateInfoFromPick = (worldPosition: Cartesian3 | null, pickedObject: any) => {
    if (!worldPosition) {
      setInfoText('Aucune position 3D détectée ici.')
      return
    }

    const cartographic = Cartographic.fromCartesian(worldPosition)
    const lines = [
      `Longitude: ${formatDegrees(cartographic.longitude)}`,
      `Latitude: ${formatDegrees(cartographic.latitude)}`,
      `Hauteur: ${formatMeters(cartographic.height)}`,
    ]

    if (pickedObject && typeof pickedObject.getPropertyIds === 'function') {
      const propertyIds = pickedObject.getPropertyIds() as string[]
      if (propertyIds.length > 0) {
        lines.push('', 'Propriétés :')
        propertyIds.forEach(id => {
          lines.push(`${id}: ${String(pickedObject.getProperty(id))}`)
        })
      }
    }

    setInfoText(lines.join('\n'))
  }

  const midpoint = (a: Cartesian3, b: Cartesian3) => Cartesian3.midpoint(a, b, new Cartesian3())

  const completeDistanceMeasurement = (a: Cartesian3, b: Cartesian3) => {
    const distance = Cartesian3.distance(a, b)
    addMeasureLine([a, b])
    addMeasureLabel(midpoint(a, b), formatMeters(distance))
    setStatusText(`Distance 3D : ${formatMeters(distance)}`)
  }

  const completeHeightMeasurement = (a: Cartesian3, b: Cartesian3) => {
    const aCartographic = Cartographic.fromCartesian(a)
    const bCartographic = Cartographic.fromCartesian(b)
    const hinge = Cartesian3.fromRadians(bCartographic.longitude, bCartographic.latitude, aCartographic.height)
    const deltaZ = bCartographic.height - aCartographic.height

    addMeasureLine([a, hinge, b])
    addMeasureLabel(midpoint(a, b), `ΔZ: ${formatMeters(deltaZ)}`)
    setStatusText(`Différence de hauteur : ${formatMeters(deltaZ)}`)
  }

  const updateMeasurementPreview = (cursorPosition: Cartesian3 | null) => {
    const viewer = viewerRef.current
    const start = measureStartRef.current

    if (!viewer || !start || !cursorPosition) return

    const startCartographic = Cartographic.fromCartesian(start)
    const cursorCartographic = Cartographic.fromCartesian(cursorPosition)

    const positions =
      interactionModeRef.current === 'distance'
        ? [start, cursorPosition]
        : [
            start,
            Cartesian3.fromRadians(cursorCartographic.longitude, cursorCartographic.latitude, startCartographic.height),
            cursorPosition,
          ]

    if (!tempMeasureEntityRef.current) {
      tempMeasureEntityRef.current = viewer.entities.add({
        polyline: {
          positions,
          width: 2,
          material: Color.CYAN,
        },
      })
    } else {
      tempMeasureEntityRef.current.polyline.positions = positions
    }

    requestRender()
  }

  const saveBookmark = () => {
    const viewer = viewerRef.current
    if (!viewer) return

    const nextBookmark: Bookmark = {
      id: crypto.randomUUID(),
      name: bookmarkName.trim() || `Vue ${bookmarks.length + 1}`,
      destination: {
        x: viewer.camera.positionWC.x,
        y: viewer.camera.positionWC.y,
        z: viewer.camera.positionWC.z,
      },
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll,
      },
    }

    const nextBookmarks = [...bookmarks, nextBookmark]
    setBookmarks(nextBookmarks)
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextBookmarks))
    setBookmarkName('')
    setStatusText(`Vue enregistrée : ${nextBookmark.name}`)
  }

  const deleteBookmark = (id: string) => {
    const nextBookmarks = bookmarks.filter(bookmark => bookmark.id !== id)
    setBookmarks(nextBookmarks)
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(nextBookmarks))
  }

  const flyToBookmark = (bookmark: Bookmark) => {
    const viewer = viewerRef.current
    if (!viewer) return

    viewer.camera.flyTo({
      destination: new Cartesian3(bookmark.destination.x, bookmark.destination.y, bookmark.destination.z),
      orientation: bookmark.orientation,
      duration: 1.2,
    })
  }

  const toggleAssetVisibility = (assetId: number, checked: boolean) => {
    setVisibleAssets(prev => ({
      ...prev,
      [assetId]: checked,
    }))
  }

  useEffect(() => {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    if (!raw) return

    try {
      setBookmarks(JSON.parse(raw))
    } catch {
      setBookmarks([])
    }
  }, [])

  useEffect(() => {
    if (!cesiumContainer.current || viewerRef.current) return

    let destroyed = false

    const init = async () => {
      try {
        if (!CESIUM_TOKEN) {
          throw new Error('VITE_CESIUM_TOKEN is empty')
        }

        Ion.defaultAccessToken = CESIUM_TOKEN

        const viewer = new Viewer(cesiumContainer.current!, {
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
          shouldAnimate: false,
          requestRenderMode: true,
        })

        if (destroyed) return

        viewerRef.current = viewer

        viewer.imageryLayers.removeAll()
        viewer.imageryLayers.addImageryProvider(await IonImageryProvider.fromAssetId(2))

        viewer.scene.globe.depthTestAgainstTerrain = false
        viewer.scene.globe.enableLighting = true
        viewer.scene.highDynamicRange = true
        viewer.scene.postProcessStages.fxaa.enabled = true
        viewer.scene.debugShowFramesPerSecond = false
        viewer.resolutionScale = 1

        const tilesets = await Promise.all(
          ASSET_IDS.map(assetId =>
            Cesium3DTileset.fromIonAssetId(assetId, {
              maximumScreenSpaceError: 6,
              shadows: ShadowMode.DISABLED,
            }),
          ),
        )

        if (destroyed) return

        tilesets.forEach((tileset, index) => {
          const assetId = ASSET_IDS[index]
          viewer.scene.primitives.add(tileset)
          tilesetsRef.current[assetId] = tileset
        })

        await Promise.all(tilesets.map(tileset => tileset.readyPromise))

        ASSET_IDS.forEach(assetId => {
          const tileset = tilesetsRef.current[assetId]
          if (!tileset) return
          tileset.show = true
          applyPointCloudShading(tileset)
          applyStyle(tileset, 'classification', 2)
          applyClippingToTileset(assetId, tileset)
        })

        handlerRef.current = new ScreenSpaceEventHandler(viewer.scene.canvas)

        handlerRef.current.setInputAction(click => {
          const worldPosition = getPickedCartesian(click.position)
          const pickedObject = viewer.scene.pick(click.position)

          if (interactionModeRef.current === 'inspect') {
            updateInfoFromPick(worldPosition, pickedObject)
            return
          }

          if (!worldPosition) {
            setStatusText('Aucune position 3D détectée à cet endroit.')
            return
          }

          if (!measureStartRef.current) {
            measureStartRef.current = worldPosition
            addMeasurePoint(worldPosition)
            setStatusText(
              interactionModeRef.current === 'distance'
                ? 'Sélectionne le second point pour mesurer la distance.'
                : 'Sélectionne le second point pour mesurer la différence de hauteur.',
            )
            requestRender()
            return
          }

          const start = measureStartRef.current
          addMeasurePoint(worldPosition)

          if (tempMeasureEntityRef.current) {
            viewer.entities.remove(tempMeasureEntityRef.current)
            tempMeasureEntityRef.current = null
          }

          if (interactionModeRef.current === 'distance') {
            completeDistanceMeasurement(start, worldPosition)
          } else {
            completeHeightMeasurement(start, worldPosition)
          }

          measureStartRef.current = null
          requestRender()
        }, ScreenSpaceEventType.LEFT_CLICK)

        handlerRef.current.setInputAction(movement => {
          if (interactionModeRef.current === 'inspect') return
          updateMeasurementPreview(getPickedCartesian(movement.endPosition))
        }, ScreenSpaceEventType.MOUSE_MOVE)

        flyToVisibleTilesets('fit')
        setStatusText('LiDAR chargé')
        setIsLoading(false)
        requestRender()
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatusText('Échec d’initialisation')
        setIsLoading(false)
      }
    }

    init()

    return () => {
      destroyed = true
      clearMeasurements()

      if (handlerRef.current && !handlerRef.current.isDestroyed()) {
        handlerRef.current.destroy()
        handlerRef.current = null
      }

      if (viewerRef.current) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }

      tilesetsRef.current = {}
      clippingRefs.current = {}
    }
  }, [])

  useEffect(() => {
    getTilesets().forEach(tileset => applyStyle(tileset, colorMode, pointSize))
    requestRender()
  }, [colorMode, pointSize])

  useEffect(() => {
    getTilesets().forEach(tileset => applyPointCloudShading(tileset))
    requestRender()
  }, [attenuation, eyeDomeLighting])

  useEffect(() => {
    ASSET_IDS.forEach(assetId => {
      const tileset = tilesetsRef.current[assetId]
      if (tileset) tileset.show = !!visibleAssets[assetId]
    })

    setStatusText(`Assets visibles : ${visibleCount}/${ASSET_IDS.length}`)
    requestRender()
  }, [visibleAssets, visibleCount])

  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.scene.debugShowFramesPerSecond = showFps
      requestRender()
    }
  }, [showFps])

  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.resolutionScale = resolutionScale
      requestRender()
    }
  }, [resolutionScale])

  useEffect(() => {
    ASSET_IDS.forEach(assetId => {
      applyClippingToTileset(assetId, tilesetsRef.current[assetId])
    })
    requestRender()
  }, [clipEnabled, clipDistance])

  useEffect(() => {
    interactionModeRef.current = interactionMode
    measureStartRef.current = null
    if (tempMeasureEntityRef.current && viewerRef.current) {
      viewerRef.current.entities.remove(tempMeasureEntityRef.current)
      tempMeasureEntityRef.current = null
    }

    setStatusText(
      interactionMode === 'inspect'
        ? 'Mode inspection'
        : interactionMode === 'distance'
          ? 'Mode distance 3D'
          : 'Mode différence de hauteur',
    )

    requestRender()
  }, [interactionMode])

  return (
    <>
      <div ref={cesiumContainer} className="map3d-container" />

      <button className="scene-back-btn" onClick={onBack} type="button">
        ← Retour
      </button>

      {isLoading && <div className="map3d-loading">Chargement LiDAR 3D Tiles...</div>}

      <aside className={`lidar-dock ${panelCollapsed ? 'collapsed' : ''}`}>
        <div className="lidar-dock-header">
          <div className="lidar-dock-headings">
            <span className="lidar-dock-kicker">LiDAR 3D</span>
            <div className="lidar-dock-title">La Rochelle</div>
            <div className="lidar-dock-source">Source : Cesium ion · {ASSET_IDS.length} assets</div>
          </div>

          <div className="lidar-dock-actions">
            <button
              className={`lidar-ghost-btn ${showAdvanced ? 'active' : ''}`}
              onClick={() => setShowAdvanced(v => !v)}
              type="button"
            >
              Options
            </button>

            <button
              className="lidar-icon-btn"
              onClick={() => setPanelCollapsed(v => !v)}
              type="button"
              aria-label={panelCollapsed ? 'Déployer le panneau' : 'Réduire le panneau'}
            >
              {panelCollapsed ? '+' : '−'}
            </button>
          </div>
        </div>

        {panelCollapsed ? (
          <div className="lidar-dock-mini">
            <div className="lidar-mini-badge">{visibleCount}/{ASSET_IDS.length}</div>
            <div className="lidar-mini-text">{statusText}</div>
          </div>
        ) : (
          <div className="lidar-dock-body">
            <div className="lidar-section">
              <div className="lidar-section-label">Outils</div>

              <div className="lidar-tool-row">
                <button
                  onClick={() => setInteractionMode('inspect')}
                  className={`lidar-tool-btn ${interactionMode === 'inspect' ? 'active' : ''}`}
                  type="button"
                >
                  <span className="lidar-tool-icon">◎</span>
                  <span>Inspecter</span>
                </button>

                <button
                  onClick={() => setInteractionMode('distance')}
                  className={`lidar-tool-btn ${interactionMode === 'distance' ? 'active' : ''}`}
                  type="button"
                >
                  <span className="lidar-tool-icon">⟷</span>
                  <span>Distance</span>
                </button>

                <button
                  onClick={() => setInteractionMode('height')}
                  className={`lidar-tool-btn ${interactionMode === 'height' ? 'active' : ''}`}
                  type="button"
                >
                  <span className="lidar-tool-icon">↕</span>
                  <span>Hauteur</span>
                </button>
              </div>
            </div>

            <div className="lidar-section">
              <div className="lidar-section-label">Navigation</div>

              <div className="lidar-chip-row">
                <button onClick={() => flyToVisibleTilesets('fit')} className="lidar-chip" type="button">
                  ⌖ Ajuster
                </button>
                <button onClick={() => flyToVisibleTilesets('oblique')} className="lidar-chip" type="button">
                  ◢ Oblique
                </button>
                <button onClick={() => flyToVisibleTilesets('top')} className="lidar-chip" type="button">
                  □ Dessus
                </button>
                <button onClick={() => clearMeasurements()} className="lidar-chip" type="button">
                  ✕ Effacer
                </button>
              </div>
            </div>

            <div className="lidar-section">
              <div className="lidar-section-label">Affichage</div>

              <div className="lidar-chip-row">
                <button
                  onClick={() => setColorMode('classification')}
                  className={`lidar-chip ${colorMode === 'classification' ? 'active' : ''}`}
                  type="button"
                >
                  Classification
                </button>
                <button
                  onClick={() => setColorMode('intensity')}
                  className={`lidar-chip ${colorMode === 'intensity' ? 'active' : ''}`}
                  type="button"
                >
                  Intensité
                </button>
                <button
                  onClick={() => setColorMode('original')}
                  className={`lidar-chip ${colorMode === 'original' ? 'active' : ''}`}
                  type="button"
                >
                  Original
                </button>
              </div>
            </div>

            <div className="lidar-kpi-row">
              <div className="lidar-kpi">
                <span>Assets visibles</span>
                <strong>{visibleCount}/{ASSET_IDS.length}</strong>
              </div>
              <div className="lidar-kpi">
                <span>Mode</span>
                <strong>
                  {interactionMode === 'inspect'
                    ? 'Inspection'
                    : interactionMode === 'distance'
                      ? 'Distance'
                      : 'Hauteur'}
                </strong>
              </div>
            </div>

            <div className="lidar-inspector">
              <div className="lidar-inspector-head">
                <span>Inspection</span>
                <strong>{statusText}</strong>
              </div>
              <div className="lidar-inspector-body">{infoText}</div>
            </div>

            {showAdvanced && (
              <div className="lidar-advanced">
                <div className="lidar-section">
                  <div className="lidar-section-label">Nuage de points</div>

                  <div className="lidar-control">
                    <div className="lidar-control-head">
                      <span>Taille des points</span>
                      <strong>{pointSize}</strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={1}
                      value={pointSize}
                      onChange={e => setPointSize(Number(e.target.value))}
                      className="lidar-range"
                    />
                  </div>

                  <div className="lidar-switch-list">
                    <label className="lidar-switch">
                      <input type="checkbox" checked={attenuation} onChange={e => setAttenuation(e.target.checked)} />
                      <span>Atténuation</span>
                    </label>

                    <label className="lidar-switch">
                      <input type="checkbox" checked={eyeDomeLighting} onChange={e => setEyeDomeLighting(e.target.checked)} />
                      <span>Eye dome lighting</span>
                    </label>

                    <label className="lidar-switch">
                      <input type="checkbox" checked={showFps} onChange={e => setShowFps(e.target.checked)} />
                      <span>FPS</span>
                    </label>
                  </div>

                  <div className="lidar-control">
                    <div className="lidar-control-head">
                      <span>Resolution scale</span>
                    </div>
                    <select
                      value={resolutionScale}
                      onChange={e => setResolutionScale(Number(e.target.value))}
                      className="lidar-select"
                    >
                      <option value={0.75}>0.75</option>
                      <option value={1}>1.0</option>
                      <option value={1.5}>1.5</option>
                    </select>
                  </div>
                </div>

                <div className="lidar-section">
                  <div className="lidar-section-label">Découpe</div>

                  <label className="lidar-switch">
                    <input type="checkbox" checked={clipEnabled} onChange={e => setClipEnabled(e.target.checked)} />
                    <span>Activer le plan</span>
                  </label>

                  <div className="lidar-control">
                    <div className="lidar-control-head">
                      <span>Offset</span>
                      <strong>{clipDistance}</strong>
                    </div>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      value={clipDistance}
                      onChange={e => setClipDistance(Number(e.target.value))}
                      className="lidar-range"
                    />
                  </div>
                </div>

                <div className="lidar-section">
                  <div className="lidar-section-label">Assets</div>

                  <div className="lidar-asset-list">
                    {ASSET_IDS.map(assetId => (
                      <label key={assetId} className="lidar-switch">
                        <input
                          type="checkbox"
                          checked={!!visibleAssets[assetId]}
                          onChange={e => toggleAssetVisibility(assetId, e.target.checked)}
                        />
                        <span>Asset {assetId}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="lidar-section">
                  <div className="lidar-section-label">Vues enregistrées</div>

                  <div className="lidar-bookmark-create">
                    <input
                      value={bookmarkName}
                      onChange={e => setBookmarkName(e.target.value)}
                      placeholder="Nom de la vue"
                      className="lidar-input"
                    />
                    <button onClick={saveBookmark} className="lidar-chip active" type="button">
                      Enregistrer
                    </button>
                  </div>

                  <div className="lidar-bookmark-list">
                    {bookmarks.length === 0 && (
                      <div className="lidar-empty">Aucune vue enregistrée.</div>
                    )}

                    {bookmarks.map(bookmark => (
                      <div key={bookmark.id} className="lidar-bookmark-row">
                        <button
                          onClick={() => flyToBookmark(bookmark)}
                          className="lidar-bookmark-btn"
                          type="button"
                        >
                          {bookmark.name}
                        </button>
                        <button
                          onClick={() => deleteBookmark(bookmark.id)}
                          className="lidar-bookmark-delete"
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && <div className="lidar-error">{error}</div>}
          </div>
        )}
      </aside>
    </>
  )
}