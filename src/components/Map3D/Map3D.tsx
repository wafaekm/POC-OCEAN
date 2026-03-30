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
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D.css'

const LA_ROCHELLE = { lon: -1.1528, lat: 46.1591 }
const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN

interface BuildingInfo {
  name: string
  height: string
  type: string
  address: string
}

export default function Map3D() {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const handler = useRef<ScreenSpaceEventHandler | null>(null)
  const highlighted = useRef<{ feature: Cesium3DTileFeature; originalColor: Color } | null>(null)
  const [buildingInfo, setBuildingInfo] = useState<BuildingInfo | null>(null)

  useEffect(() => {
    if (viewer.current || !cesiumContainer.current) return

    const init = async () => {
      try {
        Ion.defaultAccessToken = CESIUM_TOKEN

        const terrain = await createWorldTerrainAsync({
          requestVertexNormals: true,
          requestWaterMask: true,
        })

        if (!cesiumContainer.current) return

        viewer.current = new Viewer(cesiumContainer.current, {
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
        })

        const v = viewer.current

        // Imagerie Bing via Ion
        v.imageryLayers.removeAll()
        v.imageryLayers.addImageryProvider(
          await IonImageryProvider.fromAssetId(2)
        )

        v.scene.logarithmicDepthBuffer = true
        v.scene.globe.depthTestAgainstTerrain = false
        v.scene.globe.enableLighting = true
        v.scene.globe.showGroundAtmosphere = true
        v.scene.globe.translucency.enabled = false
        v.scene.screenSpaceCameraController.enableCollisionDetection = false
        v.scene.postProcessStages.fxaa.enabled = true

        // Bâtiments OSM 3D Tiles
        try {
          const buildings = await createOsmBuildingsAsync({
            defaultColor: Color.WHITE.withAlpha(0.9),
            style: new Cesium3DTileStyle({
              color: "color('white', 0.9)",
            }),
          })
          buildings.shadows = ShadowMode.DISABLED
          v.scene.primitives.add(buildings)

          handler.current = new ScreenSpaceEventHandler(v.scene.canvas)

          handler.current.setInputAction((movement: any) => {
            if (highlighted.current) {
              highlighted.current.feature.color = highlighted.current.originalColor
              highlighted.current = null
            }

            const picked = v.scene.pick(movement.endPosition)
            if (defined(picked) && picked instanceof Cesium3DTileFeature) {
              highlighted.current = {
                feature: picked,
                originalColor: picked.color.clone(),
              }
              picked.color = Color.YELLOW.withAlpha(0.85)
              v.scene.canvas.style.cursor = 'pointer'
            } else {
              v.scene.canvas.style.cursor = 'default'
            }
          }, ScreenSpaceEventType.MOUSE_MOVE)

          // Clic — affiche les infos
          handler.current.setInputAction((click: any) => {
            const picked = v.scene.pick(click.position)

            if (defined(picked) && picked instanceof Cesium3DTileFeature) {
              const name =
                picked.getProperty('name') ||
                picked.getProperty('addr:housename') ||
                'Bâtiment sans nom'

              const rawHeight =
                picked.getProperty('cesium#estimatedHeight') ||
                picked.getProperty('height') ||
                picked.getProperty('building:levels')

              const height = rawHeight
                ? `${parseFloat(rawHeight).toFixed(1)}m`
                : 'Non renseignée'

              const type =
                picked.getProperty('building') ||
                picked.getProperty('amenity') ||
                picked.getProperty('shop') ||
                picked.getProperty('office') ||
                'Non renseigné'

              const street = picked.getProperty('addr:street') || ''
              const number = picked.getProperty('addr:housenumber') || ''
              const address = street
                ? `${number} ${street}`.trim()
                : 'Non renseignée'

              setBuildingInfo({ name, height, type, address })
            } else {
              setBuildingInfo(null)
            }
          }, ScreenSpaceEventType.LEFT_CLICK)

        } catch (err) {
          console.warn('Bâtiments 3D non chargés:', err)
        }

        v.camera.flyTo({
          destination: Cartesian3.fromDegrees(
            LA_ROCHELLE.lon - 0.02,
            LA_ROCHELLE.lat - 0.04,
            1500
          ),
          orientation: {
            heading: CesiumMath.toRadians(10),
            pitch: CesiumMath.toRadians(-35),
            roll: 0,
          },
          duration: 2.5,
        })

      } catch (err) {
        console.error('Cesium error:', err)
      }
    }

    init()

    return () => {
      handler.current?.destroy()
      handler.current = null
      viewer.current?.destroy()
      viewer.current = null
    }
  }, [])

  return (
    <div className="map3d-wrapper">
      <div ref={cesiumContainer} className="map3d-container" />

      {buildingInfo && (
        <div className="building-panel">
          <div className="building-panel-header">
            <span className="building-panel-title">{buildingInfo.name}</span>
            <button
              className="building-panel-close"
              onClick={() => setBuildingInfo(null)}
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
          <div className="building-footer">
            Source : OpenStreetMap
          </div>
        </div>
      )}
    </div>
  )
}