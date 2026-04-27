import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Viewer,
  Ion,
  IonImageryProvider,
  CesiumTerrainProvider,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorBlendMode,
  DistanceDisplayCondition,
  Entity,
  GeoJsonDataSource,
  HeightReference,
  NearFarScalar,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  HeadingPitchRoll,
  Transforms,
  Math as CesiumMath,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './Map3D/Map3D.css'


const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN
const RELAY_URL = 'ws://localhost:8787'
const BOAT_MODEL_URI = '/models/boat.glb'

const MODEL_SCALE = 0.05
const MODEL_MIN_PIXEL_SIZE = 0
const MODEL_MAX_SCALE = 8
const MODEL_HEIGHT_OFFSET = 0
const MODEL_HEADING_OFFSET = 90
const MODEL_PITCH_OFFSET = 90
const MODEL_ROLL_OFFSET = 0

const BALISAGE_HEIGHT = 2.5
const BALISAGE_ICON_GROUND_OFFSET = 0
const BALISAGE_LABEL_OFFSET_Y = 8
const BALISAGE_FAR_DISTANCE = 6500
const BALISAGE_SELECTED_DISTANCE = 80000
const BALISAGE_LABEL_MAX_DISTANCE = 1800
const BALISAGE_UPDATE_INTERVAL_MS = 160

const MARINE_ONLY_LAYERS = [
  'boycar',
  'boyinb',
  'boyisd',
  'boylat',
  'boysaw',
  'boyspp',
  'newobj',
  'aisatn',
  'morfac',
]

const BALISAGE_ICONS: Record<string, string> = {
  aisatn: 'NEWOBJ.svg',
  boycar: 'BOYCAR_N.svg',
  boyinb: 'MORFAC_BOYINB.svg',
  boyisd: 'BOYISD.svg',
  boylat: 'BOYLAT_T.svg',
  boysaw: 'BOYSAW.svg',
  boyspp: 'BOYSPP.svg',
  morfac: 'MORFAC_BOYINB.svg',
  newobj: 'NEWOBJ.svg',
}

type BalisageBillboardSpec = {
  width: number
  height: number
}

const BALISAGE_BILLBOARD_SPECS: Record<string, BalisageBillboardSpec> = {
  aisatn: { width: 34, height: 68 },
  boycar: { width: 38, height: 76 },
  boyinb: { width: 38, height: 76 },
  boyisd: { width: 38, height: 76 },
  boylat: { width: 38, height: 76 },
  boysaw: { width: 38, height: 76 },
  boyspp: { width: 38, height: 76 },
  morfac: { width: 40, height: 70 },
  newobj: { width: 34, height: 68 },
}

const makeFallbackSvg = (label: string, fill: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="400" viewBox="0 0 200 400">
      <rect x="35" y="35" width="130" height="330" rx="20" fill="${fill}" stroke="#0b1220" stroke-width="14"/>
      <text x="100" y="215" text-anchor="middle" font-size="54" fill="#ffffff" font-family="Arial, sans-serif">
        ${label.slice(0, 3).toUpperCase()}
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

interface Props {
  onBack: () => void
}

type BBox = {
  south: number
  west: number
  north: number
  east: number
}

type VesselState = {
  id: string
  kind: 'vessel' | 'sar'
  mmsi: string
  name: string
  lat?: number
  lon?: number
  sog?: number
  cog?: number
  heading?: number
  navStatus?: number
  shipType?: number
  updatedAt?: string
  raw?: unknown
}

type EventRow = {
  id: string
  time: string
  type: string
  title: string
  text: string
}

type VesselRow = {
  id: string
  mmsi: string
  name: string
  kind: 'vessel' | 'sar'
  sog?: number
  lat?: number
  lon?: number
  updatedAt?: string
}

type BalisageLayerState = {
  name: string
  visible: boolean
  count: number
}

type SelectionMode = 'none' | 'vessel' | 'balisage'

type SelectedBalisage = {
  id: string
  layerName: string
  title: string
  info: string
}

type BalisagePopup = {
  id: string
  title: string
  layerName: string
  info: string
  photoUrls: string[]
  photoIndex: number
  screenX: number
  screenY: number
}

const DEFAULT_BBOX: BBox = {
  south: 46.1,
  west: -1.25,
  north: 46.25,
  east: -1.05,
}

const trimImageTransparentPixels = async (source: string, targetWidth: number, targetHeight: number) => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = source
  })




  const sourceCanvas = document.createElement('canvas')
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 200)
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 400)

  sourceCanvas.width = sourceWidth
  sourceCanvas.height = sourceHeight

  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) return source

  sourceContext.clearRect(0, 0, sourceWidth, sourceHeight)
  sourceContext.drawImage(image, 0, 0, sourceWidth, sourceHeight)

  const imageData = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
  const data = imageData.data

  let minX = sourceWidth
  let minY = sourceHeight
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const alpha = data[(y * sourceWidth + x) * 4 + 3]

      if (alpha > 8) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  if (maxX < minX || maxY < minY) return source

  const cropWidth = maxX - minX + 1
  const cropHeight = maxY - minY + 1

  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = targetWidth * 2
  outputCanvas.height = targetHeight * 2

  const outputContext = outputCanvas.getContext('2d')
  if (!outputContext) return source

  outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height)

  const availableWidth = outputCanvas.width
  const availableHeight = outputCanvas.height
  const scale = Math.min(availableWidth / cropWidth, availableHeight / cropHeight)
  const drawWidth = cropWidth * scale
  const drawHeight = cropHeight * scale
  const drawX = (outputCanvas.width - drawWidth) / 2
  const drawY = outputCanvas.height - drawHeight

  outputContext.drawImage(
    sourceCanvas,
    minX,
    minY,
    cropWidth,
    cropHeight,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  )

  return outputCanvas.toDataURL('image/png')
}

export default function LaRochelleAisLiveView({ onBack }: Props) {
  const cesiumContainer = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const bboxEntityRef = useRef<Entity | null>(null)
  const entityMapRef = useRef<Map<string, Entity>>(new Map())
  const vesselMapRef = useRef<Map<string, VesselState>>(new Map())
  const balisageSourcesRef = useRef<Map<string, GeoJsonDataSource>>(new Map())
  const balisageEntityLayerRef = useRef<Map<string, string>>(new Map())
  const balisageImageCacheRef = useRef<Map<string, Promise<string>>>(new Map())
  const selectedBalisageIdRef = useRef<string | null>(null)
  const balisageVisibilityTimerRef = useRef<number | null>(null)
  const cameraChangedRemoveRef = useRef<(() => void) | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState('Disconnected')
  const [error, setError] = useState<string | null>(null)
  const [bbox, setBbox] = useState<BBox>(DEFAULT_BBOX)
  const [showLabels, setShowLabels] = useState(true)
  const [showSafety, setShowSafety] = useState(true)
  const [showStatic, setShowStatic] = useState(true)
  const [showSar, setShowSar] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedVessel, setSelectedVessel] = useState<VesselState | null>(null)
  const [selectedMode, setSelectedMode] = useState<SelectionMode>('none')
  const [selectedBalisage, setSelectedBalisage] = useState<SelectedBalisage | null>(null)
  const [balisagePopup, setBalisagePopup] = useState<BalisagePopup | null>(null)
  const [vesselRows, setVesselRows] = useState<VesselRow[]>([])
  const [eventRows, setEventRows] = useState<EventRow[]>([])
  const [messageCount, setMessageCount] = useState(0)
  const [liveCount, setLiveCount] = useState(0)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showBalisage, setShowBalisage] = useState(true)
  const [showBalisageLabels, setShowBalisageLabels] = useState(true)
  const [balisageLayers, setBalisageLayers] = useState<BalisageLayerState[]>([])

  const visibleEvents = useMemo(() => eventRows.slice(0, 8), [eventRows])
  const visibleVessels = useMemo(() => vesselRows.slice(0, 10), [vesselRows])

  const requestRender = () => {
    viewerRef.current?.scene.requestRender()
  }

  const formatNumber = (value?: number, digits = 5) => {
    if (value === undefined || value === null || Number.isNaN(value)) return '-'
    return value.toFixed(digits)
  }

  const formatSpeed = (value?: number) => {
    if (value === undefined || value === null || Number.isNaN(value)) return '-'
    return `${value.toFixed(1)} kn`
  }

  const getDisplayName = (record: VesselState) => {
    if (record.name && record.name.trim()) return record.name.trim()
    return record.kind === 'sar' ? `SAR ${record.mmsi}` : `MMSI ${record.mmsi}`
  }

  const getMeta = (payload: any) => payload?.MetaData ?? payload?.Metadata ?? {}

  const getModelColor = (kind: 'vessel' | 'sar') => {
    return kind === 'sar'
      ? Color.fromCssColorString('#c97964')
      : Color.fromCssColorString('#6d8aa3')
  }

  const getOrientation = (lon: number, lat: number, heading?: number, cog?: number) => {
    const headingDeg = (heading ?? cog ?? 0) + MODEL_HEADING_OFFSET
    const pitchDeg = MODEL_PITCH_OFFSET
    const rollDeg = MODEL_ROLL_OFFSET
    const position = Cartesian3.fromDegrees(lon, lat, MODEL_HEIGHT_OFFSET)

    return Transforms.headingPitchRollQuaternion(
      position,
      new HeadingPitchRoll(
        CesiumMath.toRadians(headingDeg),
        CesiumMath.toRadians(pitchDeg),
        CesiumMath.toRadians(rollDeg),
      ),
    )
  }

  const getBalisageSvgUrl = (layerName: string) => {
    const fileName = BALISAGE_ICONS[layerName]

    if (!fileName) {
      return makeFallbackSvg(layerName, '#3fb4ff')
    }

    return `/balisage/svg/${fileName}`
  }

  const getBalisageBillboardSpec = (layerName: string) => {
    return BALISAGE_BILLBOARD_SPECS[layerName] ?? { width: 38, height: 76 }
  }

  const getAnchoredBalisageImage = (layerName: string) => {
    const cached = balisageImageCacheRef.current.get(layerName)

    if (cached) {
      return cached
    }

    const spec = getBalisageBillboardSpec(layerName)
    const source = getBalisageSvgUrl(layerName)
    const promise = trimImageTransparentPixels(source, spec.width, spec.height).catch(() => source)

    balisageImageCacheRef.current.set(layerName, promise)

    return promise
  }

  const normalizeBalisagePosition = (rawPosition: Cartesian3) => {
    const cartographic = Cartographic.fromCartesian(rawPosition)

    return Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      BALISAGE_HEIGHT,
    )
  }

  const buildMessageTypes = () => {
    const types = [
      'PositionReport',
      'StandardClassBPositionReport',
      'ExtendedClassBPositionReport',
      'LongRangeAisBroadcastMessage',
    ]

    if (showStatic) {
      types.push('ShipStaticData', 'StaticDataReport')
    }

    if (showSafety) {
      types.push('SafetyBroadcastMessage', 'AddressedSafetyMessage')
    }

    if (showSar) {
      types.push('StandardSearchAndRescueAircraftReport')
    }

    return types
  }

  const addEventRow = (row: EventRow) => {
    setEventRows(prev => [row, ...prev].slice(0, 30))
  }

  const clearSelection = () => {
    selectedBalisageIdRef.current = null
    setSelectedId(null)
    setSelectedVessel(null)
    setSelectedMode('none')
    setSelectedBalisage(null)
    setBalisagePopup(null)
  }

  const clearDynamicEntities = () => {
    const viewer = viewerRef.current
    if (!viewer) return

    entityMapRef.current.forEach(entity => {
      viewer.entities.remove(entity)
    })

    entityMapRef.current.clear()
    vesselMapRef.current.clear()
    clearSelection()
    setVesselRows([])
    setEventRows([])
    setLiveCount(0)
    requestRender()
  }

  const drawBbox = () => {
    const viewer = viewerRef.current
    if (!viewer) return

    const rectangle = Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north)

    if (!bboxEntityRef.current) {
      bboxEntityRef.current = viewer.entities.add({
        rectangle: {
          coordinates: rectangle,
          fill: false,
          outline: true,
          outlineColor: Color.CYAN.withAlpha(0.85),
          outlineWidth: 2,
        },
      })
    } else {
      bboxEntityRef.current.rectangle!.coordinates = rectangle
    }

    requestRender()
  }

  const flyToBbox = () => {
    const viewer = viewerRef.current
    if (!viewer) return

    viewer.camera.flyTo({
      destination: Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north),
      duration: 1.2,
    })
  }

  const ensureEntity = (record: VesselState) => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (record.lat === undefined || record.lon === undefined) return
    if (entityMapRef.current.has(record.id)) return

    const entity = viewer.entities.add({
      id: record.id,
      name: getDisplayName(record),
      position: Cartesian3.fromDegrees(record.lon, record.lat, MODEL_HEIGHT_OFFSET),
      orientation: getOrientation(record.lon, record.lat, record.heading, record.cog),
      model: {
        uri: BOAT_MODEL_URI,
        scale: MODEL_SCALE,
        minimumPixelSize: MODEL_MIN_PIXEL_SIZE,
        maximumScale: MODEL_MAX_SCALE,
        color: getModelColor(record.kind),
        colorBlendMode: ColorBlendMode.MIX,
        colorBlendAmount: 0.9,
        silhouetteColor: Color.fromCssColorString('#08101d').withAlpha(0.35),
        silhouetteSize: 1,
      },
      label: {
        text: showLabels ? getDisplayName(record) : '',
        font: '12px sans-serif',
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#08101d').withAlpha(0.82),
        fillColor: Color.WHITE,
        pixelOffset: new Cartesian2(0, -20),
        verticalOrigin: VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 50000),
        scaleByDistance: new NearFarScalar(1000, 1, 50000, 0.4),
      },
    })

    entityMapRef.current.set(record.id, entity)
  }

  const refreshEntity = (record: VesselState) => {
    const entity = entityMapRef.current.get(record.id)
    if (!entity || record.lat === undefined || record.lon === undefined) return

    entity.name = getDisplayName(record)
    entity.position = Cartesian3.fromDegrees(record.lon, record.lat, MODEL_HEIGHT_OFFSET)
    entity.orientation = getOrientation(record.lon, record.lat, record.heading, record.cog)

    if (entity.label) {
      entity.label.text = showLabels ? getDisplayName(record) : ''
    }
  }

  const upsertRecord = (partial: Partial<VesselState> & { id: string; kind: 'vessel' | 'sar'; mmsi: string }) => {
    const previous = vesselMapRef.current.get(partial.id)

    const nextRecord: VesselState = {
      id: partial.id,
      kind: partial.kind,
      mmsi: partial.mmsi,
      name: partial.name ?? previous?.name ?? '',
      lat: partial.lat ?? previous?.lat,
      lon: partial.lon ?? previous?.lon,
      sog: partial.sog ?? previous?.sog,
      cog: partial.cog ?? previous?.cog,
      heading: partial.heading ?? previous?.heading,
      navStatus: partial.navStatus ?? previous?.navStatus,
      shipType: partial.shipType ?? previous?.shipType,
      updatedAt: partial.updatedAt ?? previous?.updatedAt,
      raw: partial.raw ?? previous?.raw,
    }

    vesselMapRef.current.set(nextRecord.id, nextRecord)
    ensureEntity(nextRecord)
    refreshEntity(nextRecord)

    if (selectedId === nextRecord.id) {
      setSelectedVessel({ ...nextRecord })
      setSelectedMode('vessel')
    }

    requestRender()
  }

  const syncRows = () => {
    const all = Array.from(vesselMapRef.current.values())

    const rows = all
      .sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return tb - ta
      })
      .slice(0, 50)
      .map(record => ({
        id: record.id,
        mmsi: record.mmsi,
        name: getDisplayName(record),
        kind: record.kind,
        sog: record.sog,
        lat: record.lat,
        lon: record.lon,
        updatedAt: record.updatedAt,
      }))

    setVesselRows(rows)
    setLiveCount(all.length)

    if (selectedId) {
      const selected = vesselMapRef.current.get(selectedId)
      setSelectedVessel(selected ? { ...selected } : null)
    }
  }

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setConnectionStatus('Disconnected')
  }

  const getBalisageValue = (entity: any, keys: string[], time: any) => {
    for (const key of keys) {
      const value = entity?.properties?.[key]?.getValue?.(time)

      if (value !== undefined && value !== null && value !== '') {
        return String(value)
      }
    }

    return ''
  }

  const getBalisageTitle = (entity: any, layerName: string, time: any) => {
    const label = getBalisageValue(
      entity,
      ['NOM', 'NOM_OBJET', 'LIBELLE', 'OBJNAM', 'NAME', 'TOPMAR', 'CATLAM', 'BOYSHP', 'BCNSHP', 'COLOUR', 'SIGGRP', 'LITCHR'],
      time,
    )

    if (label) return label

    return layerName
  }

  const formatBalisageInfo = (entity: any, layerName: string, time: any) => {
    const lines = [`Couche: ${layerName}`]
    const propertyNames = entity?.properties?.propertyNames ?? []

    for (const name of propertyNames) {
      const value = entity.properties[name]?.getValue?.(time)
      lines.push(`${name}: ${String(value)}`)
    }

    return lines.join('\n')
  }

  const slugifyBalisageId = (value: string) => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

  const getBalisagePhotoUrls = (entity: any, layerName: string, time: any) => {
  const objectId = getBalisageValue(
    entity,
    ['id', 'ID', 'OBJNAM', 'NOBJNM', 'NOM', 'NOM_OBJET', 'LIBELLE'],
    time,
  )

  const urls = []

  if (objectId) {
    const slug = slugifyBalisageId(objectId)
    urls.push(`/balisage/photos/by-id/${slug}.jpg`)
    urls.push(`/balisage/photos/${layerName}/${slug}.jpg`)
  }

  urls.push(`/balisage/photos/${layerName}/default.jpg`)
  urls.push('/balisage/photos/newobj/default.jpg')

  return urls
}

  const updateBalisageVisibilityByCamera = () => {
    const viewer = viewerRef.current
    if (!viewer) return

    const time = viewer.clock.currentTime
    const cameraPosition = viewer.camera.positionWC
    const selectedBalisageId = selectedBalisageIdRef.current

    balisageSourcesRef.current.forEach(dataSource => {
      dataSource.entities.values.forEach(entity => {
        const key = (entity as any).__balisageKey
        const position = entity.position?.getValue(time)

        if (!position) return

        const distance = Cartesian3.distance(cameraPosition, position)
        const isSelected = selectedBalisageId !== null && key === selectedBalisageId
        const shouldShowIcon = isSelected || distance <= BALISAGE_FAR_DISTANCE
        const shouldShowLabel = showBalisageLabels && (isSelected || distance <= BALISAGE_LABEL_MAX_DISTANCE)

        if (entity.billboard) {
          entity.billboard.show = shouldShowIcon
          entity.billboard.distanceDisplayCondition = new DistanceDisplayCondition(
            0,
            isSelected ? BALISAGE_SELECTED_DISTANCE : BALISAGE_FAR_DISTANCE,
          )
        }

        if (entity.label) {
          entity.label.show = shouldShowLabel
          entity.label.distanceDisplayCondition = new DistanceDisplayCondition(
            0,
            isSelected ? BALISAGE_SELECTED_DISTANCE : BALISAGE_LABEL_MAX_DISTANCE,
          )
        }
      })
    })

    requestRender()
  }

  const setSingleBalisageLayerVisibility = (layerName: string, visible: boolean) => {
    const dataSource = balisageSourcesRef.current.get(layerName)
    if (!dataSource) return

    dataSource.show = visible

    setBalisageLayers(prev =>
      prev.map(layer =>
        layer.name === layerName
          ? { ...layer, visible }
          : layer,
      ),
    )

    requestRender()
  }

  const toggleBalisageLayer = (layerName: string) => {
    const existing = balisageLayers.find(layer => layer.name === layerName)
    if (!existing) return

    setSingleBalisageLayerVisibility(layerName, !existing.visible)
  }

  const applyAllBalisageVisibility = (visible: boolean) => {
    balisageSourcesRef.current.forEach(dataSource => {
      dataSource.show = visible
    })

    setBalisageLayers(prev => prev.map(layer => ({ ...layer, visible })))
    updateBalisageVisibilityByCamera()
    requestRender()
  }

  const applyBalisageLabels = () => {
    const viewer = viewerRef.current
    if (!viewer) return

    balisageSourcesRef.current.forEach((dataSource, layerName) => {
      const time = viewer.clock.currentTime

      dataSource.entities.values.forEach(entity => {
        const labelText = getBalisageTitle(entity, layerName, time)

        entity.label = {
          text: showBalisageLabels ? labelText : '',
          show: showBalisageLabels && Boolean(labelText),
          font: '12px sans-serif',
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#08101d').withAlpha(0.82),
          fillColor: Color.WHITE,
          pixelOffset: new Cartesian2(0, BALISAGE_LABEL_OFFSET_Y),
          verticalOrigin: VerticalOrigin.TOP,
          distanceDisplayCondition: new DistanceDisplayCondition(0, BALISAGE_LABEL_MAX_DISTANCE),
          scaleByDistance: new NearFarScalar(300, 1, BALISAGE_LABEL_MAX_DISTANCE, 0.45),
          heightReference: HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      })
    })

    updateBalisageVisibilityByCamera()
    requestRender()
  }

  const loadBalisageLayers = async () => {
    const viewer = viewerRef.current
    if (!viewer) return

    const manifestResponse = await fetch('/data/balisage/manifest.json')
    const manifestJson = await manifestResponse.json()

    const allLayerNames: string[] = Array.isArray(manifestJson)
      ? manifestJson
      : Array.isArray(manifestJson?.layers)
        ? manifestJson.layers
        : []

    const layerNames = allLayerNames.filter(layerName => MARINE_ONLY_LAYERS.includes(layerName))
    const loadedStates: BalisageLayerState[] = []

    for (const layerName of layerNames) {
      const dataSource = await GeoJsonDataSource.load(`/data/balisage/${layerName}.geojson`, {
        clampToGround: false,
      })

      viewer.dataSources.add(dataSource)
      dataSource.show = showBalisage

      const time = viewer.clock.currentTime
      const spec = getBalisageBillboardSpec(layerName)
      const anchoredImage = await getAnchoredBalisageImage(layerName)

      dataSource.entities.values.forEach((entity, index) => {
        if (!entity.position) return

        const rawPosition = entity.position.getValue(time) as Cartesian3 | undefined
        if (!rawPosition) return

        const anchoredPosition = normalizeBalisagePosition(rawPosition)
        const entityKey = `${layerName}:${String(entity.id)}:${index}`

        balisageEntityLayerRef.current.set(entityKey, layerName)
        ;(entity as any).__balisageKey = entityKey

        entity.position = anchoredPosition
        entity.point = undefined
        entity.polyline = undefined
        entity.path = undefined
        entity.model = undefined

        entity.billboard = {
          image: anchoredImage,
          width: spec.width,
          height: spec.height,
          heightReference: HeightReference.NONE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, BALISAGE_ICON_GROUND_OFFSET),
          distanceDisplayCondition: new DistanceDisplayCondition(0, BALISAGE_FAR_DISTANCE),
          scaleByDistance: new NearFarScalar(200, 1.15, BALISAGE_FAR_DISTANCE, 0.38),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          color: Color.WHITE,
        }

        const labelText = getBalisageTitle(entity, layerName, time)

        entity.label = {
          text: showBalisageLabels ? labelText : '',
          show: showBalisageLabels && Boolean(labelText),
          font: '12px sans-serif',
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#08101d').withAlpha(0.82),
          fillColor: Color.WHITE,
          pixelOffset: new Cartesian2(0, BALISAGE_LABEL_OFFSET_Y),
          verticalOrigin: VerticalOrigin.TOP,
          distanceDisplayCondition: new DistanceDisplayCondition(0, BALISAGE_LABEL_MAX_DISTANCE),
          scaleByDistance: new NearFarScalar(300, 1, BALISAGE_LABEL_MAX_DISTANCE, 0.45),
          heightReference: HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
      })

      balisageSourcesRef.current.set(layerName, dataSource)

      loadedStates.push({
        name: layerName,
        visible: showBalisage,
        count: dataSource.entities.values.length,
      })
    }

    setBalisageLayers(loadedStates)
    updateBalisageVisibilityByCamera()
    requestRender()
  }

  const connect = () => {
    disconnect()
    clearDynamicEntities()
    drawBbox()
    flyToBbox()
    setConnectionStatus('Connecting...')
    setError(null)
    setMessageCount(0)

    const ws = new WebSocket(RELAY_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnectionStatus('Connected')

      ws.send(
        JSON.stringify({
          type: 'subscribe',
          BoundingBoxes: [[[bbox.south, bbox.west], [bbox.north, bbox.east]]],
          FilterMessageTypes: buildMessageTypes(),
        }),
      )
    }

    ws.onmessage = event => {
      try {
        const payload = JSON.parse(event.data)

        if (payload?.error) {
          setError(String(payload.error))
          return
        }

        const messageType = payload?.MessageType
        const message = payload?.Message?.[messageType]
        const meta = getMeta(payload)

        setMessageCount(prev => prev + 1)

        if (
          messageType === 'PositionReport' ||
          messageType === 'StandardClassBPositionReport' ||
          messageType === 'ExtendedClassBPositionReport' ||
          messageType === 'LongRangeAisBroadcastMessage'
        ) {
          const mmsi = String(message?.UserID ?? meta?.MMSI ?? '')
          const lat = message?.Latitude ?? meta?.latitude ?? meta?.Latitude
          const lon = message?.Longitude ?? meta?.longitude ?? meta?.Longitude

          if (!mmsi || lat === undefined || lon === undefined) return

          upsertRecord({
            id: `vessel:${mmsi}`,
            kind: 'vessel',
            mmsi,
            name: meta?.ShipName ?? '',
            lat,
            lon,
            sog: message?.Sog,
            cog: message?.Cog,
            heading: message?.TrueHeading,
            navStatus: message?.NavigationalStatus,
            updatedAt: meta?.time_utc ?? new Date().toISOString(),
            raw: payload,
          })

          return
        }

        if (messageType === 'ShipStaticData' || messageType === 'StaticDataReport') {
          const mmsi = String(message?.UserID ?? meta?.MMSI ?? '')
          if (!mmsi) return

          upsertRecord({
            id: `vessel:${mmsi}`,
            kind: 'vessel',
            mmsi,
            name: message?.Name ?? meta?.ShipName ?? '',
            shipType: message?.Type,
            updatedAt: meta?.time_utc ?? new Date().toISOString(),
            raw: payload,
          })

          return
        }

        if (messageType === 'StandardSearchAndRescueAircraftReport') {
          const mmsi = String(message?.UserID ?? meta?.MMSI ?? '')
          const lat = message?.Latitude ?? meta?.latitude ?? meta?.Latitude
          const lon = message?.Longitude ?? meta?.longitude ?? meta?.Longitude

          if (!mmsi || lat === undefined || lon === undefined) return

          upsertRecord({
            id: `sar:${mmsi}`,
            kind: 'sar',
            mmsi,
            name: meta?.ShipName ?? 'Search And Rescue',
            lat,
            lon,
            sog: message?.Sog,
            cog: message?.Cog,
            heading: message?.TrueHeading,
            updatedAt: meta?.time_utc ?? new Date().toISOString(),
            raw: payload,
          })

          addEventRow({
            id: `${Date.now()}-${mmsi}`,
            time: meta?.time_utc ?? new Date().toISOString(),
            type: 'SAR',
            title: `SAR ${mmsi}`,
            text: `Position ${formatNumber(lat, 5)}, ${formatNumber(lon, 5)}`,
          })

          return
        }

        if (messageType === 'SafetyBroadcastMessage' || messageType === 'AddressedSafetyMessage') {
          addEventRow({
            id: `${Date.now()}-${Math.random()}`,
            time: meta?.time_utc ?? new Date().toISOString(),
            type: messageType,
            title: meta?.ShipName ?? `MMSI ${message?.UserID ?? meta?.MMSI ?? '-'}`,
            text: message?.Text ?? JSON.stringify(message),
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'WebSocket error')
      }
    }

    ws.onerror = () => {
      setConnectionStatus('Error')
    }

    ws.onclose = () => {
      setConnectionStatus('Closed')
    }
  }

  useEffect(() => {
    if (!cesiumContainer.current || viewerRef.current) return

    let destroyed = false

    const init = async () => {
      try {
        if (!CESIUM_TOKEN) {
          throw new Error('VITE_CESIUM_TOKEN is empty')
        }

        Ion.defaultAccessToken = CESIUM_TOKEN

        const terrainProvider = await CesiumTerrainProvider.fromIonAssetId(1, {
          requestWaterMask: true,
          requestVertexNormals: true,
        })

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
          shouldAnimate: true,
          requestRenderMode: false,
          terrainProvider,
        })

        if (destroyed) return

        viewerRef.current = viewer
        viewer.imageryLayers.removeAll()
        viewer.imageryLayers.addImageryProvider(await IonImageryProvider.fromAssetId(2))
        viewer.scene.globe.enableLighting = false
        viewer.scene.globe.depthTestAgainstTerrain = false
        viewer.scene.globe.showWaterEffect = true
        viewer.scene.highDynamicRange = true
        viewer.scene.postProcessStages.fxaa.enabled = true
        viewer.clock.shouldAnimate = true
        viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5)

        const onCameraChanged = () => {
          if (balisageVisibilityTimerRef.current !== null) return

          balisageVisibilityTimerRef.current = window.setTimeout(() => {
            balisageVisibilityTimerRef.current = null
            updateBalisageVisibilityByCamera()
          }, BALISAGE_UPDATE_INTERVAL_MS)
        }

        cameraChangedRemoveRef.current = viewer.camera.changed.addEventListener(onCameraChanged)

        drawBbox()
        flyToBbox()
        await loadBalisageLayers()

        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
        handlerRef.current = handler

        handler.setInputAction(click => {
          const picked = viewer.scene.pick(click.position) as any
          const pickedEntity = picked?.id

          if (!pickedEntity) {
            clearSelection()
            updateBalisageVisibilityByCamera()
            return
          }

          const pickedId = pickedEntity?.id

          if (typeof pickedId === 'string' && vesselMapRef.current.has(pickedId)) {
            selectedBalisageIdRef.current = null
            setSelectedId(pickedId)
            setSelectedVessel({ ...vesselMapRef.current.get(pickedId)! })
            setSelectedMode('vessel')
            setSelectedBalisage(null)
            setBalisagePopup(null)
            updateBalisageVisibilityByCamera()
            return
          }

          const balisageKey = (pickedEntity as any).__balisageKey

          if (balisageKey) {
            const layerName = balisageEntityLayerRef.current.get(balisageKey) ?? 'balisage'
            const title = getBalisageTitle(pickedEntity, layerName, viewer.clock.currentTime)
            const info = formatBalisageInfo(pickedEntity, layerName, viewer.clock.currentTime)
            const photoUrls = getBalisagePhotoUrls(pickedEntity, layerName, viewer.clock.currentTime)
            selectedBalisageIdRef.current = balisageKey

            setSelectedId(null)
            setSelectedVessel(null)
            setSelectedMode('balisage')
            setSelectedBalisage({
              id: balisageKey,
              layerName,
              title,
              info,
            })
            setBalisagePopup({
              id: balisageKey,
              title,
              layerName,
              info,
              photoUrls,
              photoIndex: 0,
              screenX: click.position.x,
              screenY: click.position.y,
            })

            updateBalisageVisibilityByCamera()
            return
          }

          clearSelection()
          updateBalisageVisibilityByCamera()
        }, ScreenSpaceEventType.LEFT_CLICK)

        setIsLoading(false)
        connect()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setIsLoading(false)
      }
    }

    init()

    return () => {
      destroyed = true
      disconnect()

      if (balisageVisibilityTimerRef.current !== null) {
        window.clearTimeout(balisageVisibilityTimerRef.current)
        balisageVisibilityTimerRef.current = null
      }

      if (cameraChangedRemoveRef.current) {
        cameraChangedRemoveRef.current()
        cameraChangedRemoveRef.current = null
      }

      if (handlerRef.current && !handlerRef.current.isDestroyed()) {
        handlerRef.current.destroy()
        handlerRef.current = null
      }

      if (viewerRef.current) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }

      entityMapRef.current.clear()
      vesselMapRef.current.clear()
      balisageSourcesRef.current.clear()
      balisageEntityLayerRef.current.clear()
      balisageImageCacheRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      syncRows()
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [selectedId])

  useEffect(() => {
    entityMapRef.current.forEach((entity, id) => {
      const record = vesselMapRef.current.get(id)
      if (!record || !entity.label) return

      entity.label.text = showLabels ? getDisplayName(record) : ''
    })

    requestRender()
  }, [showLabels])

  useEffect(() => {
    drawBbox()
    requestRender()
  }, [bbox])

  useEffect(() => {
    applyAllBalisageVisibility(showBalisage)
  }, [showBalisage])

  useEffect(() => {
    applyBalisageLabels()
  }, [showBalisageLabels])

  const focusSelected = () => {
    const viewer = viewerRef.current
    if (!viewer) return

    if (
      selectedMode === 'vessel' &&
      selectedVessel &&
      selectedVessel.lat !== undefined &&
      selectedVessel.lon !== undefined
    ) {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(selectedVessel.lon, selectedVessel.lat, 3500),
        duration: 1.1,
      })

      return
    }

    if (selectedMode === 'balisage' && selectedBalisage) {
      balisageSourcesRef.current.forEach(dataSource => {
        const entity = dataSource.entities.values.find(
          item => (item as any).__balisageKey === selectedBalisage.id,
        )

        if (entity?.position) {
          const pos = entity.position.getValue(viewer.clock.currentTime)

          if (pos) {
            const cartographic = Cartographic.fromCartesian(pos)

            viewer.camera.flyTo({
              destination: Cartesian3.fromRadians(
                cartographic.longitude,
                cartographic.latitude,
                650,
              ),
              orientation: {
                heading: CesiumMath.toRadians(0),
                pitch: CesiumMath.toRadians(-45),
                roll: 0,
              },
              duration: 1.1,
            })
          }
        }
      })
    }
  }

  return (
    <>
      <div ref={cesiumContainer} className="map3d-container" />

      {balisagePopup && (
        <div
          className="balisage-popup"
          style={{
            left: Math.min(balisagePopup.screenX + 18, window.innerWidth - 340),
            top: Math.min(balisagePopup.screenY + 18, window.innerHeight - 420),
          }}
        >
          <button
            className="balisage-popup-close"
            onClick={() => setBalisagePopup(null)}
            type="button"
            aria-label="Fermer"
          >
            ×
          </button>

          <div className="balisage-popup-title">{balisagePopup.title}</div>
          <div className="balisage-popup-subtitle">{balisagePopup.layerName}</div>

         {balisagePopup.photoUrls[balisagePopup.photoIndex] && (
            <img
              src={balisagePopup.photoUrls[balisagePopup.photoIndex]}
              alt={balisagePopup.title}
              className="balisage-popup-image"
              onError={() => {
                setBalisagePopup(prev => {
                  if (!prev) return prev

                  const nextIndex = prev.photoIndex + 1

                  if (nextIndex >= prev.photoUrls.length) {
                    return {
                      ...prev,
                      photoUrls: [],
                      photoIndex: 0,
                    }
                  }

                  return {
                    ...prev,
                    photoIndex: nextIndex,
                  }
                })
              }}
            />
          )}

          <div className="balisage-popup-info">{balisagePopup.info}</div>

          <button onClick={focusSelected} className="balisage-popup-focus" type="button">
            Focus caméra
          </button>
        </div>
      )}

      <button className="scene-back-btn" onClick={onBack} type="button">
        ← Retour
      </button>

      {isLoading && <div className="map3d-loading">Connexion au flux AIS...</div>}

      <aside className={`ais-dock ${panelCollapsed ? 'collapsed' : ''}`}>
        <div className="ais-dock-header">
          <div className="ais-dock-headings">
            <span className="ais-dock-kicker">AIS + BALISAGE</span>
            <div className="ais-dock-title">La Rochelle</div>
            <div className="ais-dock-source">Source : relais local · modèles 3D navires · SVG balisage</div>
          </div>

          <div className="ais-dock-actions">
            <button
              className={`ais-ghost-btn ${showAdvanced ? 'active' : ''}`}
              onClick={() => setShowAdvanced(v => !v)}
              type="button"
            >
              Options
            </button>

            <button
              className="ais-icon-btn"
              onClick={() => setPanelCollapsed(v => !v)}
              type="button"
              aria-label={panelCollapsed ? 'Déployer le panneau' : 'Réduire le panneau'}
            >
              {panelCollapsed ? '+' : '−'}
            </button>
          </div>
        </div>

        {panelCollapsed ? (
          <div className="ais-dock-mini">
            <div className={`ais-status-pill ${connectionStatus.toLowerCase().includes('connected') ? 'ok' : ''}`}>
              {connectionStatus}
            </div>
            <div className="ais-mini-stats">{liveCount} cibles</div>
            <div className="ais-mini-stats">{balisageLayers.filter(layer => layer.visible).length} couches</div>
          </div>
        ) : (
          <div className="ais-dock-body">
            <div className="ais-primary-actions">
              <button onClick={connect} className="ais-primary-btn" type="button">
                ↻ Reconnecter
              </button>
              <button onClick={disconnect} className="ais-secondary-btn" type="button">
                ■ Stop
              </button>
              <button
                onClick={() => {
                  clearDynamicEntities()
                  drawBbox()
                }}
                className="ais-secondary-btn"
                type="button"
              >
                ✕ Effacer AIS
              </button>
            </div>

            <div className="ais-kpi-row">
              <div className="ais-kpi">
                <span>Connexion</span>
                <strong>{connectionStatus}</strong>
              </div>
              <div className="ais-kpi">
                <span>Messages</span>
                <strong>{messageCount}</strong>
              </div>
              <div className="ais-kpi">
                <span>Cibles live</span>
                <strong>{liveCount}</strong>
              </div>
            </div>

            <div className="ais-kpi-row">
              <div className="ais-kpi">
                <span>Couches balisage</span>
                <strong>{balisageLayers.length}</strong>
              </div>
              <div className="ais-kpi">
                <span>Actives</span>
                <strong>{balisageLayers.filter(layer => layer.visible).length}</strong>
              </div>
              <div className="ais-kpi">
                <span>SVG</span>
                <strong>{showBalisage ? 'On' : 'Off'}</strong>
              </div>
            </div>

            <div className="ais-section">
              <div className="ais-section-label">Sélection</div>

              <div className="ais-selected-card">
                {selectedMode === 'vessel' && selectedVessel ? (
                  <>
                    <div className="ais-selected-head">
                      <div>
                        <div className="ais-selected-title">{getDisplayName(selectedVessel)}</div>
                        <div className="ais-selected-sub">
                          {selectedVessel.kind === 'sar' ? 'SAR' : 'Vessel'} · {selectedVessel.mmsi}
                        </div>
                      </div>

                      <button onClick={focusSelected} className="ais-chip active" type="button">
                        Focus
                      </button>
                    </div>

                    <div className="ais-selected-grid">
                      <div className="ais-meta-row">
                        <span>Vitesse</span>
                        <strong>{formatSpeed(selectedVessel.sog)}</strong>
                      </div>
                      <div className="ais-meta-row">
                        <span>Cap</span>
                        <strong>{selectedVessel.cog != null ? `${selectedVessel.cog.toFixed(0)}°` : '-'}</strong>
                      </div>
                      <div className="ais-meta-row">
                        <span>Latitude</span>
                        <strong>{formatNumber(selectedVessel.lat)}</strong>
                      </div>
                      <div className="ais-meta-row">
                        <span>Longitude</span>
                        <strong>{formatNumber(selectedVessel.lon)}</strong>
                      </div>
                      <div className="ais-meta-row">
                        <span>Maj</span>
                        <strong>{selectedVessel.updatedAt ?? '-'}</strong>
                      </div>
                    </div>
                  </>
                ) : selectedMode === 'balisage' && selectedBalisage ? (
                  <>
                    <div className="ais-selected-head">
                      <div>
                        <div className="ais-selected-title">{selectedBalisage.title}</div>
                        <div className="ais-selected-sub">
                          Balisage · {selectedBalisage.layerName}
                        </div>
                      </div>

                      <button onClick={focusSelected} className="ais-chip active" type="button">
                        Focus
                      </button>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        maxHeight: 240,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: '#dfe7f3',
                      }}
                    >
                      {selectedBalisage.info}
                    </div>
                  </>
                ) : (
                  <div className="ais-empty">Clique sur un navire ou un balisage pour afficher ses informations principales.</div>
                )}
              </div>
            </div>

            <div className="ais-section">
              <div className="ais-section-label">Cibles AIS en cours</div>

              <div className="ais-list">
                {visibleVessels.length === 0 && (
                  <div className="ais-empty">Aucune position reçue pour l’instant.</div>
                )}

                {visibleVessels.map(row => (
                  <button
                    key={row.id}
                    onClick={() => {
                      selectedBalisageIdRef.current = null
                      setSelectedId(row.id)
                      const record = vesselMapRef.current.get(row.id)

                      if (record) {
                        setSelectedVessel({ ...record })
                        setSelectedMode('vessel')
                        setSelectedBalisage(null)
                        setBalisagePopup(null)
                      }

                      updateBalisageVisibilityByCamera()
                    }}
                    className={`ais-list-item ${selectedId === row.id ? 'active' : ''}`}
                    type="button"
                  >
                    <div className="ais-list-item-top">
                      <span>{row.name}</span>
                      <span>{row.kind === 'sar' ? 'SAR' : formatSpeed(row.sog)}</span>
                    </div>
                    <div className="ais-list-item-sub">
                      {row.mmsi} · {formatNumber(row.lat)} , {formatNumber(row.lon)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="ais-section">
              <div className="ais-section-label">Événements</div>

              <div className="ais-feed">
                {visibleEvents.length === 0 && (
                  <div className="ais-empty">Aucun événement de sécurité reçu.</div>
                )}

                {visibleEvents.map(row => (
                  <div key={row.id} className="ais-feed-item">
                    <div className="ais-feed-title">{row.title}</div>
                    <div className="ais-feed-meta">{row.type} · {row.time}</div>
                    <div className="ais-feed-text">{row.text}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ais-section">
              <div className="ais-section-label">Balisage</div>

              <div className="ais-switch-list">
                <label className="ais-switch">
                  <input type="checkbox" checked={showBalisage} onChange={e => setShowBalisage(e.target.checked)} />
                  <span>Afficher le balisage</span>
                </label>

                <label className="ais-switch">
                  <input
                    type="checkbox"
                    checked={showBalisageLabels}
                    onChange={e => setShowBalisageLabels(e.target.checked)}
                  />
                  <span>Labels balisage</span>
                </label>
              </div>

              <div className="ais-list" style={{ marginTop: 10 }}>
                {balisageLayers.length === 0 && (
                  <div className="ais-empty">Aucune couche GeoJSON chargée.</div>
                )}

                {balisageLayers.map(layer => (
                  <button
                    key={layer.name}
                    onClick={() => toggleBalisageLayer(layer.name)}
                    className={`ais-list-item ${layer.visible ? 'active' : ''}`}
                    type="button"
                  >
                    <div className="ais-list-item-top">
                      <span>{layer.name}</span>
                      <span>{layer.visible ? 'Visible' : 'Masquée'}</span>
                    </div>
                    <div className="ais-list-item-sub">
                      {layer.count} objets
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {showAdvanced && (
              <div className="ais-advanced">
                <div className="ais-section">
                  <div className="ais-section-label">Affichage AIS</div>

                  <div className="ais-switch-list">
                    <label className="ais-switch">
                      <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
                      <span>Labels navires</span>
                    </label>

                    <label className="ais-switch">
                      <input type="checkbox" checked={showStatic} onChange={e => setShowStatic(e.target.checked)} />
                      <span>Données statiques</span>
                    </label>

                    <label className="ais-switch">
                      <input type="checkbox" checked={showSafety} onChange={e => setShowSafety(e.target.checked)} />
                      <span>Messages sécurité</span>
                    </label>

                    <label className="ais-switch">
                      <input type="checkbox" checked={showSar} onChange={e => setShowSar(e.target.checked)} />
                      <span>SAR</span>
                    </label>
                  </div>

                  <button onClick={connect} className="ais-chip active" type="button">
                    Appliquer les filtres AIS
                  </button>
                </div>

                <div className="ais-section">
                  <div className="ais-section-label">Zone d’écoute AIS</div>

                  <div className="ais-bbox-grid">
                    <input
                      className="ais-input"
                      type="number"
                      value={bbox.south}
                      onChange={e => setBbox(prev => ({ ...prev, south: Number(e.target.value) }))}
                      placeholder="South"
                    />
                    <input
                      className="ais-input"
                      type="number"
                      value={bbox.north}
                      onChange={e => setBbox(prev => ({ ...prev, north: Number(e.target.value) }))}
                      placeholder="North"
                    />
                    <input
                      className="ais-input"
                      type="number"
                      value={bbox.west}
                      onChange={e => setBbox(prev => ({ ...prev, west: Number(e.target.value) }))}
                      placeholder="West"
                    />
                    <input
                      className="ais-input"
                      type="number"
                      value={bbox.east}
                      onChange={e => setBbox(prev => ({ ...prev, east: Number(e.target.value) }))}
                      placeholder="East"
                    />
                  </div>

                  <div className="ais-chip-row">
                    <button onClick={flyToBbox} className="ais-chip" type="button">
                      Zoom zone
                    </button>
                    <button onClick={connect} className="ais-chip active" type="button">
                      Appliquer + reconnecter
                    </button>
                  </div>
                </div>

                <div className="ais-section">
                  <div className="ais-section-label">Balisage global</div>

                  <div className="ais-chip-row">
                    <button onClick={() => setShowBalisage(true)} className="ais-chip active" type="button">
                      Tout afficher
                    </button>
                    <button onClick={() => setShowBalisage(false)} className="ais-chip" type="button">
                      Tout masquer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="ais-error">{error}</div>}
          </div>
        )}
      </aside>
    </>
  )
}