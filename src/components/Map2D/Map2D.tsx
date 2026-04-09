 import { useEffect, useRef, useState, useCallback } from 'react'
 import maplibregl from 'maplibre-gl'
 import 'maplibre-gl/dist/maplibre-gl.css'
 import type { LayerId } from '../../types/layers.types'
 import '../Map2D/Map2D.css'
 import WW3Legend from '../Map2D/WW3Legend'
 
 const LA_ROCHELLE_CENTER: [number, number] = [-1.1528, 46.1591]
 const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
 const BDTOPO_WFS   = 'https://data.geopf.fr/wfs/ows'
 const BDTOPO_MIN_ZOOM = 13  // n'affiche les bâtiments qu'à partir de ce zoom
 
 // ─── TYPES ───────────────────────────────────────────────────────────────────
 interface Scenario {
   id: string
   label: string
   niveau_m: number
 }
 
 interface Impact {
   niveau_m: number
   batiments_touches: number
   routes_coupees: number
   reseaux_critiques: string[]
   surface_inondee_ha: number
 }
 
 interface Props {
   layers: Record<LayerId, boolean>
 }
 
 interface WW3Point   { id: number; lon: number; lat: number }
 interface WW3Grid    { n_points: number; points: WW3Point[] }
 interface WW3Cell    { hs: number; tp?: number; dir?: number; phs0?: number; ptp0?: number; pd0?: number }
 interface WW3Frame   { ts: string; n_active: number; hs_max: number; hs_mean: number; cells: Record<string, WW3Cell> }
 interface WW3FramesFile { n_frames: number; frames: WW3Frame[] }
 interface WW3Meta    { center: { lon: number; lat: number }; bbox: { lon_min: number; lat_min: number; lon_max: number; lat_max: number }; hs_global_max: number; n_points: number }
 
 type WW3VarKey = 'hs' | 'tp' | 'dir' | 'phs0' | 'ptp0'
 
 interface VarConfig {
   label: string
   unit: string
   colorExpr: maplibregl.ExpressionSpecification
 }
 
 // ─── CONFIG COULEURS WW3 ─────────────────────────────────────────────────────
 const VAR_CONFIG: Record<WW3VarKey, VarConfig> = {
   hs: {
     label: 'Hs (m)', unit: 'm',
     colorExpr: ['interpolate', ['linear'], ['get', 'val'],
       0, '#001840', 0.25, '#003d7a', 0.5, '#0066cc', 0.75, '#0099ff',
       1.0, '#00ccff', 1.25, '#66ffcc', 1.5, '#ffdd00', 2.0, '#ff4400',
     ] as maplibregl.ExpressionSpecification,
   },
   tp: {
     label: 'Tp (s)', unit: 's',
     colorExpr: ['interpolate', ['linear'], ['get', 'val'],
       0, '#001840', 4, '#003388', 6, '#0066cc', 8, '#00aaff',
       10, '#44eebb', 12, '#aaff44', 15, '#ffdd00', 20, '#ff4400',
     ] as maplibregl.ExpressionSpecification,
   },
   dir: {
     label: 'Dir (°)', unit: '°',
     colorExpr: ['interpolate', ['linear'], ['get', 'val'],
       0, '#ff0000', 90, '#ffff00', 180, '#0088ff', 270, '#8800ff', 360, '#ff0000',
     ] as maplibregl.ExpressionSpecification,
   },
   phs0: {
     label: 'Hs houle 1 (m)', unit: 'm',
     colorExpr: ['interpolate', ['linear'], ['get', 'val'],
       0, '#001020', 0.3, '#004488', 0.6, '#0077cc', 0.9, '#00aaff',
       1.2, '#44eebb', 1.5, '#ff8800',
     ] as maplibregl.ExpressionSpecification,
   },
   ptp0: {
     label: 'Tp houle 1 (s)', unit: 's',
     colorExpr: ['interpolate', ['linear'], ['get', 'val'],
       0, '#001020', 5, '#003366', 8, '#0066cc', 10, '#00aaff',
       12, '#44ddbb', 15, '#aaff44', 20, '#ff4400',
     ] as maplibregl.ExpressionSpecification,
   },
 }
 
 // ─── HELPERS ─────────────────────────────────────────────────────────────────
 const buildAssetUrl = (path: string) =>
   `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
 
 async function fetchJson<T>(path: string): Promise<T> {
   const res  = await fetch(buildAssetUrl(path), { headers: { Accept: 'application/json' } })
   const text = await res.text()
   if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`)
   try { return JSON.parse(text) as T }
   catch { throw new Error(`${path} ne renvoie pas du JSON. Réponse: ${text.slice(0, 120)}`) }
 }
 
 // ─── FETCH BD TOPO IGN ───────────────────────────────────────────────────────
 async function fetchBdTopoBuildings(
   m: maplibregl.Map,
   bounds: maplibregl.LngLatBounds
 ): Promise<void> {
   if (m.getZoom() < BDTOPO_MIN_ZOOM) {
     const src = m.getSource('bdtopo-batiments') as maplibregl.GeoJSONSource | undefined
     src?.setData({ type: 'FeatureCollection', features: [] })
     return
   }
 
   const bbox = [
     bounds.getWest().toFixed(5),
     bounds.getSouth().toFixed(5),
     bounds.getEast().toFixed(5),
     bounds.getNorth().toFixed(5),
   ].join(',') + ',EPSG:4326'
 
   const params = new URLSearchParams({
     SERVICE:      'WFS',
     VERSION:      '2.0.0',
     REQUEST:      'GetFeature',
     TYPENAMES:    'BDTOPO_V3:batiment',
     OUTPUTFORMAT: 'application/json',
     SRSNAME:      'EPSG:4326',
     BBOX:         bbox,
     COUNT:        '3000',
   })
 
   try {
     const res  = await fetch(`${BDTOPO_WFS}?${params.toString()}`)
     const data = await res.json()
     const src  = m.getSource('bdtopo-batiments') as maplibregl.GeoJSONSource | undefined
     src?.setData(data)
     console.log(`[BD TOPO IGN] ${data.features?.length ?? 0} bâtiments chargés`)
   } catch (e) {
     console.warn('[BD TOPO IGN] Erreur fetch:', e)
   }
 }
 
 // ─── COMPOSANT ───────────────────────────────────────────────────────────────
 export default function Map2D({ layers }: Props) {
   const mapContainer = useRef<HTMLDivElement>(null)
   const map          = useRef<maplibregl.Map | null>(null)
   const mapReady     = useRef(false)
   const dirCanvas    = useRef<HTMLCanvasElement>(null)
   const moveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
 
   // ── State scénarios ────────────────────────────────────────
   const [scenarios, setScenarios]           = useState<Scenario[]>([])
   const [activeScenario, setActiveScenario] = useState<string | null>(null)
   const [impact, setImpact]                 = useState<Impact | null>(null)
   const [showImpact, setShowImpact]         = useState(false)
 
   // ── State bâtiments BD TOPO ────────────────────────────────
   const [bdtopoActive, setBdtopoActive] = useState(false)
   const [bdtopoCount, setBdtopoCount]   = useState(0)
 
   // ── State WW3 ──────────────────────────────────────────────
   const [ww3Grid, setWW3Grid]       = useState<WW3Grid | null>(null)
   const [ww3Frames, setWW3Frames]   = useState<WW3FramesFile | null>(null)
   const [ww3Meta, setWW3Meta]       = useState<WW3Meta | null>(null)
   const [ww3Loaded, setWW3Loaded]   = useState(false)
   const [ww3Active, setWW3Active]   = useState(false)
   const [ww3Frame, setWW3Frame]     = useState(0)
   const [ww3Var, setWW3Var]         = useState<WW3VarKey>('hs')
   const [ww3Playing, setWW3Playing] = useState(false)
   const [ww3Arrows, setWW3Arrows]   = useState(true)
   const [ww3Loading, setWW3Loading] = useState(false)
   const [ww3Error, setWW3Error]     = useState<string | null>(null)
 
   const ww3PlayRef   = useRef<ReturnType<typeof setInterval> | null>(null)
   const ww3GridRef   = useRef<WW3Grid | null>(null)
   const ww3FramesRef = useRef<WW3FramesFile | null>(null)
   const ww3FrameRef  = useRef(0)
   const ww3VarRef    = useRef<WW3VarKey>('hs')
   const ww3ArrowRef  = useRef(true)
   const bdtopoActiveRef = useRef(false)
 
   useEffect(() => { ww3GridRef.current      = ww3Grid   }, [ww3Grid])
   useEffect(() => { ww3FramesRef.current    = ww3Frames }, [ww3Frames])
   useEffect(() => { ww3FrameRef.current     = ww3Frame  }, [ww3Frame])
   useEffect(() => { ww3VarRef.current       = ww3Var    }, [ww3Var])
   useEffect(() => { ww3ArrowRef.current     = ww3Arrows }, [ww3Arrows])
   useEffect(() => { bdtopoActiveRef.current = bdtopoActive }, [bdtopoActive])
 
   // ── Chargement scénarios ───────────────────────────────────
   useEffect(() => {
     fetchJson<Scenario[]>('data/scenarios/index.json').then(setScenarios).catch(console.error)
   }, [])
 
   // ── Chargement WW3 ─────────────────────────────────────────
   const loadWW3Data = useCallback(async () => {
     if (ww3Loaded && ww3GridRef.current && ww3FramesRef.current && ww3Meta)
       return { grid: ww3GridRef.current, frames: ww3FramesRef.current, meta: ww3Meta }
 
     setWW3Loading(true); setWW3Error(null)
     try {
       const [grid, frames, meta] = await Promise.all([
         fetchJson<WW3Grid>('data/ww3/lr_grid.json'),
         fetchJson<WW3FramesFile>('data/ww3/lr_frames.json'),
         fetchJson<WW3Meta>('data/ww3/lr_metadata.json'),
       ])
       setWW3Grid(grid); setWW3Frames(frames); setWW3Meta(meta); setWW3Loaded(true)
       ww3GridRef.current = grid; ww3FramesRef.current = frames
       return { grid, frames, meta }
     } catch (e) {
       const msg = e instanceof Error ? e.message : 'Erreur WW3 inconnue'
       setWW3Error(msg); console.error('WW3 load error:', e); return null
     } finally { setWW3Loading(false) }
   }, [ww3Loaded, ww3Meta])
 
   // ── Flèches direction WW3 ──────────────────────────────────
   const drawWW3Arrows = useCallback(() => {
     const canvas = dirCanvas.current
     const m      = map.current
     const grid   = ww3GridRef.current
     const frames = ww3FramesRef.current
     if (!canvas || !m || !grid || !frames) return
     canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight
     const ctx = canvas.getContext('2d')
     if (!ctx) return
     ctx.clearRect(0, 0, canvas.width, canvas.height)
     if (!ww3ArrowRef.current) return
 
     const frame   = frames.frames[ww3FrameRef.current]
     const zoom    = m.getZoom()
     const step    = zoom < 9 ? 10 : zoom < 11 ? 5 : 2
     const arrowSz = zoom < 9 ? 6  : zoom < 11 ? 9 : 13
     ctx.lineWidth = 1.2
 
     grid.points.forEach((pt, idx) => {
       if (idx % step !== 0) return
       const cd = frame.cells[String(pt.id)]
       if (cd?.dir == null) return
       const px = m.project([pt.lon, pt.lat] as [number, number])
       if (px.x < -10 || px.x > canvas.width + 10 || px.y < -10 || px.y > canvas.height + 10) return
       const dirRad = (cd.dir - 90) * Math.PI / 180
       const len    = arrowSz * (0.5 + (cd.hs ?? 0.5) / 1.5)
       const x2     = px.x + Math.cos(dirRad) * len
       const y2     = px.y + Math.sin(dirRad) * len
       const alpha  = 0.5 + Math.min((cd.hs ?? 0) / 1.5, 0.4)
       ctx.strokeStyle = `rgba(255,255,255,${alpha})`
       ctx.fillStyle   = `rgba(255,255,255,${alpha})`
       ctx.beginPath(); ctx.moveTo(px.x, px.y); ctx.lineTo(x2, y2); ctx.stroke()
       const hLen = arrowSz * 0.35
       const angle = Math.atan2(y2 - px.y, x2 - px.x)
       ctx.beginPath()
       ctx.moveTo(x2, y2)
       ctx.lineTo(x2 - hLen * Math.cos(angle - 0.4), y2 - hLen * Math.sin(angle - 0.4))
       ctx.lineTo(x2 - hLen * Math.cos(angle + 0.4), y2 - hLen * Math.sin(angle + 0.4))
       ctx.closePath(); ctx.fill()
     })
   }, [])
 
   // ── Init carte ─────────────────────────────────────────────
   useEffect(() => {
     if (map.current || !mapContainer.current) return
 
     map.current = new maplibregl.Map({
       container: mapContainer.current,
       style: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
       center: LA_ROCHELLE_CENTER,
       zoom: 12,
       pitch: 30,
     })
 
     const m = map.current
     m.addControl(new maplibregl.NavigationControl(), 'top-right')
     m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
 
     m.on('load', () => {
       // ── PPRI ────────────────────────────────────────────────
       m.addSource('ppri', { type: 'geojson', data: buildAssetUrl('data/ppri.geojson') })
       m.addLayer({ id: 'ppri-fill',  type: 'fill', source: 'ppri',
         paint: { 'fill-color': '#E24B4A', 'fill-opacity': 0.25 } })
       m.addLayer({ id: 'ppri-zones', type: 'line', source: 'ppri',
         paint: { 'line-color': '#E24B4A', 'line-width': 1.5, 'line-dasharray': [3, 2] } })
 
       // ── Réseaux critiques ────────────────────────────────────
       m.addSource('critical-networks', { type: 'geojson', data: buildAssetUrl('data/critical_networks.geojson') })
       m.addLayer({
         id: 'critical-networks-layer', type: 'circle', source: 'critical-networks',
         paint: {
           'circle-radius': 6,
           'circle-color': ['match', ['get', 'category'], 'eau', '#3498DB', 'secours_sante', '#E74C3C', '#ffffff'],
           'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
         },
       })
 
       // ── Tiles submersion ─────────────────────────────────────
       m.addSource('flood-tiles', { type: 'raster', tiles: [], tileSize: 256 })
       m.addLayer({ id: 'flood-tiles-layer', type: 'raster', source: 'flood-tiles',
         paint: { 'raster-opacity': 0.65 }, layout: { visibility: 'none' } })
 
       // ── BD TOPO IGN — Bâtiments extrudés ────────────────────
       m.addSource('bdtopo-batiments', {
         type: 'geojson',
         data: { type: 'FeatureCollection', features: [] },
       })
 
       // Extrusion 3D
       m.addLayer({
         id: 'batiments-extrusion',
         type: 'fill-extrusion',
         source: 'bdtopo-batiments',
         layout: { visibility: 'none' },
         paint: {
           'fill-extrusion-color': [
             'match', ['get', 'nature'],
             'Industriel, agricole ou commercial', '#c4956a',
             'Religieux',                          '#d4c4a0',
             'Sportif',                            '#6aaa88',
             'Remarquable',                        '#e8d080',
             'Serre',                              '#88cc88',
             'Réservoir, silo ou entrepôt',        '#8899aa',
             /* défaut — résidentiel */             '#b8c8d8',
           ],
           // Hauteur réelle BD TOPO, fallback nb_etages × 3m, fallback 6m
           'fill-extrusion-height': [
             'coalesce',
             ['get', 'hauteur'],
             ['*', ['coalesce', ['get', 'nombre_d_etages'], 2], 3],
             6,
           ],
           'fill-extrusion-base': 0,
           'fill-extrusion-opacity': 0.88,
           'fill-extrusion-vertical-gradient': true,
         },
       })
 
       // Contour bâtiments (affiché à partir du zoom 14)
       m.addLayer({
         id: 'batiments-outline',
         type: 'line',
         source: 'bdtopo-batiments',
         layout: { visibility: 'none' },
         minzoom: 14,
         paint: {
           'line-color': 'rgba(255,255,255,0.15)',
           'line-width': 0.5,
         },
       })
 
       // Tooltip bâtiment
       m.on('click', 'batiments-extrusion', e => {
         const props = e.features?.[0]?.properties
         if (!props) return
         const hauteur = props.hauteur ? `${props.hauteur.toFixed(1)} m` : `~${(props.nombre_d_etages ?? 2) * 3} m`
         new maplibregl.Popup({ maxWidth: '260px' })
           .setLngLat(e.lngLat)
           .setHTML(`
             <div style="font-family:sans-serif;padding:6px 2px">
               <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#1a1a2e">
                 ${props.nature ?? 'Bâtiment'}
               </div>
               <div style="font-size:11px;color:#555;display:grid;grid-template-columns:1fr 1fr;gap:3px 12px">
                 <span>Usage</span><span style="color:#222;font-weight:600">${props.usage_1 ?? '—'}</span>
                 <span>Hauteur</span><span style="color:#222;font-weight:600">${hauteur}</span>
                 <span>Étages</span><span style="color:#222;font-weight:600">${props.nombre_d_etages ?? '—'}</span>
                 <span>Matériaux</span><span style="color:#222;font-weight:600">${props.materiaux_des_murs ?? '—'}</span>
                 <span>État</span><span style="color:#222;font-weight:600">${props.etat_de_l_objet ?? '—'}</span>
                 <span>ID RNB</span><span style="color:#888;font-size:10px">${props.identifiants_rnb ?? '—'}</span>
               </div>
               <div style="font-size:9px;color:#aaa;margin-top:6px">Source : BD TOPO® IGN</div>
             </div>
           `)
           .addTo(m)
       })
       m.on('mouseenter', 'batiments-extrusion', () => { m.getCanvas().style.cursor = 'pointer' })
       m.on('mouseleave', 'batiments-extrusion', () => { m.getCanvas().style.cursor = '' })
 
       // ── Source WW3 ───────────────────────────────────────────
       m.addSource('ww3-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
       m.addLayer({
         id: 'ww3-circles', type: 'circle', source: 'ww3-source',
         layout: { visibility: 'none' },
         paint: {
           'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 10, 5, 12, 8, 14, 12],
           'circle-color': VAR_CONFIG.hs.colorExpr,
           'circle-opacity': 0.82,
           'circle-stroke-width': 0,
         },
       })
 
       // Tooltip WW3
       m.on('mousemove', 'ww3-circles', e => {
         if (!e.features?.length) return
         const p  = e.features[0].properties as Record<string, number>
         const el = document.getElementById('ww3-tooltip')
         if (!el) return
         el.style.display = 'block'
         el.style.left    = `${e.point.x + 14}px`
         el.style.top     = `${e.point.y - 8}px`
         const fmt = (v: number | null | undefined, u: string, d = 2) =>
           v != null ? `${v.toFixed(d)} ${u}` : '—'
         el.innerHTML = `
           <div class="ww3-tt-title">Point WW3</div>
           <div class="ww3-tt-row"><span>Hs</span><span>${fmt(p.hs, 'm')}</span></div>
           <div class="ww3-tt-row"><span>Tp</span><span>${fmt(p.tp, 's', 1)}</span></div>
           <div class="ww3-tt-row"><span>Direction</span><span>${fmt(p.dir, '°', 0)}</span></div>
           <div class="ww3-tt-row"><span>Hs houle 1</span><span>${fmt(p.phs0, 'm')}</span></div>
           <div class="ww3-tt-row"><span>Tp houle 1</span><span>${fmt(p.ptp0, 's', 1)}</span></div>
         `
       })
       m.on('mouseleave', 'ww3-circles', () => {
         const el = document.getElementById('ww3-tooltip')
         if (el) el.style.display = 'none'
       })
 
       // ── Réseaux critiques interactions ───────────────────────
       m.on('click', 'critical-networks-layer', e => {
         const props = e.features?.[0]?.properties
         if (!props) return
         new maplibregl.Popup()
           .setLngLat(e.lngLat)
           .setHTML(`<div style="font-family:sans-serif;padding:4px">
             <strong>${props.nom || props.name || 'Réseau critique'}</strong><br/>
             <span style="font-size:12px;color:#666">Type : ${props.category || 'N/A'}</span>
           </div>`)
           .addTo(m)
       })
       m.on('mouseenter', 'critical-networks-layer', () => { m.getCanvas().style.cursor = 'pointer' })
       m.on('mouseleave', 'critical-networks-layer', () => { m.getCanvas().style.cursor = '' })
 
       // ── Marker La Rochelle ───────────────────────────────────
       new maplibregl.Marker({ color: '#E24B4A' })
         .setLngLat(LA_ROCHELLE_CENTER)
         .setPopup(new maplibregl.Popup().setHTML('<strong>La Rochelle</strong><br/>Zone pilote POC Géo-Twin'))
         .addTo(m)
 
       // ── Events flèches + BD TOPO ─────────────────────────────
       m.on('move',   () => drawWW3Arrows())
       m.on('zoom',   () => drawWW3Arrows())
       m.on('render', () => { if (ww3ArrowRef.current) drawWW3Arrows() })
 
       m.on('moveend', () => {
         if (!bdtopoActiveRef.current) return
         if (moveTimer.current) clearTimeout(moveTimer.current)
         moveTimer.current = setTimeout(() => {
           fetchBdTopoBuildings(m, m.getBounds()).then(() => {
             const src = m.getSource('bdtopo-batiments') as maplibregl.GeoJSONSource | undefined
             if (src) {
               // Compter les features pour afficher le compteur
               const data = (src as any)._data as GeoJSON.FeatureCollection | undefined
               setBdtopoCount(data?.features?.length ?? 0)
             }
           })
         }, 400)
       })
 
       mapReady.current = true
     })
 
     return () => {
       if (moveTimer.current) clearTimeout(moveTimer.current)
       map.current?.remove()
       map.current = null
     }
   }, [drawWW3Arrows])
 
   // ── Sync visibilité couches ────────────────────────────────
   useEffect(() => {
     if (!mapReady.current || !map.current) return
     const m = map.current
     Object.entries(layers).forEach(([id, visible]) => {
       if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
     })
   }, [layers])
 
   // ── Toggle bâtiments BD TOPO ───────────────────────────────
   const toggleBdtopo = useCallback(async () => {
     const m = map.current
     if (!m || !mapReady.current) return
 
     const next = !bdtopoActive
     setBdtopoActive(next)
     bdtopoActiveRef.current = next
 
     const vis = next ? 'visible' : 'none'
     if (m.getLayer('batiments-extrusion')) m.setLayoutProperty('batiments-extrusion', 'visibility', vis)
     if (m.getLayer('batiments-outline'))   m.setLayoutProperty('batiments-outline',   'visibility', vis)
 
     if (next) {
       await fetchBdTopoBuildings(m, m.getBounds())
       const src  = m.getSource('bdtopo-batiments') as maplibregl.GeoJSONSource | undefined
       const data = (src as any)?._data as GeoJSON.FeatureCollection | undefined
       setBdtopoCount(data?.features?.length ?? 0)
       // Incline la caméra pour mieux voir les extrusions
       if (m.getPitch() < 30) m.easeTo({ pitch: 45, duration: 600 })
     } else {
       setBdtopoCount(0)
       const src = m.getSource('bdtopo-batiments') as maplibregl.GeoJSONSource | undefined
       src?.setData({ type: 'FeatureCollection', features: [] })
     }
   }, [bdtopoActive])
 
   // ── WW3 GeoJSON builder ────────────────────────────────────
   const buildWW3GeoJSON = useCallback((
     frameIdx: number, varKey: WW3VarKey,
     grid: WW3Grid, framesFile: WW3FramesFile,
   ): GeoJSON.FeatureCollection => {
     const frame    = framesFile.frames[frameIdx]
     const features: GeoJSON.Feature[] = []
     grid.points.forEach(pt => {
       const cd  = frame.cells[String(pt.id)]
       if (!cd) return
       const val = cd[varKey]
       if (val == null) return
       features.push({
         type: 'Feature',
         geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] },
         properties: { val, hs: cd.hs ?? null, tp: cd.tp ?? null,
           dir: cd.dir ?? null, phs0: cd.phs0 ?? null, ptp0: cd.ptp0 ?? null },
       })
     })
     return { type: 'FeatureCollection', features }
   }, [])
 
   // ── WW3 apply frame ───────────────────────────────────────
   const applyWW3Frame = useCallback((fi: number) => {
     const m      = map.current
     const grid   = ww3GridRef.current
     const frames = ww3FramesRef.current
     if (!m || !grid || !frames || !mapReady.current) return
     const idx = Math.max(0, Math.min(fi, frames.n_frames - 1))
     setWW3Frame(idx); ww3FrameRef.current = idx
     const gj  = buildWW3GeoJSON(idx, ww3VarRef.current, grid, frames)
     const src = m.getSource('ww3-source') as maplibregl.GeoJSONSource | undefined
     src?.setData(gj)
     drawWW3Arrows()
   }, [buildWW3GeoJSON, drawWW3Arrows])
 
   // ── WW3 playback ──────────────────────────────────────────
   const stopWW3Play  = useCallback(() => {
     if (ww3PlayRef.current) { clearInterval(ww3PlayRef.current); ww3PlayRef.current = null }
   }, [])
   const startWW3Play = useCallback(() => {
     stopWW3Play()
     ww3PlayRef.current = setInterval(() => {
       const frames = ww3FramesRef.current
       if (!frames) return
       applyWW3Frame(ww3FrameRef.current >= frames.n_frames - 1 ? 0 : ww3FrameRef.current + 1)
     }, 900)
   }, [stopWW3Play, applyWW3Frame])
   const toggleWW3Play = useCallback(() => {
     setWW3Playing(prev => { if (prev) { stopWW3Play(); return false } startWW3Play(); return true })
   }, [stopWW3Play, startWW3Play])
   const stepWW3 = useCallback((delta: number) => {
     stopWW3Play(); setWW3Playing(false); applyWW3Frame(ww3FrameRef.current + delta)
   }, [stopWW3Play, applyWW3Frame])
 
   // ── WW3 toggle ────────────────────────────────────────────
   const toggleWW3 = useCallback(async () => {
     const m = map.current
     if (!m || !mapReady.current) return
     if (!ww3Active) {
       const data = await loadWW3Data()
       if (!data) return
       m.setLayoutProperty('ww3-circles', 'visibility', 'visible')
       setWW3Active(true); setWW3Frame(0); ww3FrameRef.current = 0
       const src = m.getSource('ww3-source') as maplibregl.GeoJSONSource | undefined
       src?.setData(buildWW3GeoJSON(0, ww3VarRef.current, data.grid, data.frames))
       drawWW3Arrows()
     } else {
       stopWW3Play()
       m.setLayoutProperty('ww3-circles', 'visibility', 'none')
       const canvas = dirCanvas.current
       if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
       setWW3Active(false); setWW3Playing(false)
     }
   }, [ww3Active, loadWW3Data, buildWW3GeoJSON, drawWW3Arrows, stopWW3Play])
 
   // ── WW3 change var ────────────────────────────────────────
   const changeWW3Var = useCallback((varKey: WW3VarKey) => {
     const m = map.current
     if (!m) return
     setWW3Var(varKey); ww3VarRef.current = varKey
     m.setPaintProperty('ww3-circles', 'circle-color', VAR_CONFIG[varKey].colorExpr)
     applyWW3Frame(ww3FrameRef.current)
   }, [applyWW3Frame])
 
   useEffect(() => () => stopWW3Play(), [stopWW3Play])
 
   // ── Scénarios submersion ───────────────────────────────────
   const loadScenario = async (scenarioId: string) => {
     const m = map.current
     if (!m || !mapReady.current) return
     setActiveScenario(scenarioId); setShowImpact(false)
     try {
       const imp = await fetchJson<Impact>(`data/scenarios/${scenarioId}/impact.json`)
       setImpact(imp); setShowImpact(true)
     } catch { console.warn('impact.json non trouvé') }
     const tilesUrl = buildAssetUrl(`data/scenarios/${scenarioId}/tiles/{z}/{x}/{y}.png`)
     const src      = m.getSource('flood-tiles') as maplibregl.RasterTileSource
     if (src) { ;(src as any).setTiles([tilesUrl]); m.setLayoutProperty('flood-tiles-layer', 'visibility', 'visible') }
   }
 
   const clearScenario = () => {
     const m = map.current; if (!m) return
     setActiveScenario(null); setImpact(null); setShowImpact(false)
     m.setLayoutProperty('flood-tiles-layer', 'visibility', 'none')
   }
 
   const currentFrame = ww3Frames?.frames[ww3Frame]
   const nFrames      = ww3Frames?.n_frames ?? 0
 
   // ── RENDER ────────────────────────────────────────────────
   return (
     <div style={{ position: 'relative', width: '100%', height: '100%' }}>
       <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
 
       {/* Canvas flèches WW3 */}
       <canvas ref={dirCanvas} style={{ position: 'absolute', inset: 0,
         width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }} />
 
       {/* Tooltip WW3 */}
       <div id="ww3-tooltip" className="ww3-tooltip" style={{ display: 'none' }} />
 
       {/* ── Panel scénarios submersion ── */}
       <div className="scenario-panel">
         <div className="scenario-title">Scénarios de submersion</div>
         <div className="scenario-list">
           {scenarios.map(s => (
             <button key={s.id}
               className={`scenario-btn ${activeScenario === s.id ? 'active' : ''}`}
               onClick={() => activeScenario === s.id ? clearScenario() : loadScenario(s.id)}
             >
               <span className="scenario-label">{s.label}</span>
               <span className="scenario-niveau">+{s.niveau_m}m</span>
             </button>
           ))}
         </div>
         {activeScenario && (
           <button className="scenario-reset" onClick={clearScenario}>↺ Réinitialiser</button>
         )}
       </div>
 
       {/* ── Panel bâtiments BD TOPO ── */}
       <div className="bdtopo-panel">
         <div className="bdtopo-header">
           <div>
             <div className="bdtopo-title">Bâtiments 3D</div>
             <div className="bdtopo-subtitle">BD TOPO® IGN · Géoplateforme</div>
           </div>
           <button
             className={`bdtopo-toggle ${bdtopoActive ? 'active' : ''}`}
             onClick={toggleBdtopo}
           >
             {bdtopoActive ? 'ON' : 'OFF'}
           </button>
         </div>
         {bdtopoActive && (
           <div className="bdtopo-info">
             <div className="bdtopo-info-row">
               <span>Bâtiments chargés</span>
               <span className="bdtopo-count">{bdtopoCount.toLocaleString('fr-FR')}</span>
             </div>
             <div className="bdtopo-info-row">
               <span>Zoom min affichage</span>
               <span>{BDTOPO_MIN_ZOOM}</span>
             </div>
             <div className="bdtopo-legend">
               {[
                 { color: '#b8c8d8', label: 'Résidentiel' },
                 { color: '#c4956a', label: 'Industriel/Commercial' },
                 { color: '#d4c4a0', label: 'Religieux' },
                 { color: '#6aaa88', label: 'Sportif' },
                 { color: '#e8d080', label: 'Remarquable' },
               ].map(({ color, label }) => (
                 <div key={label} className="bdtopo-legend-row">
                   <span className="bdtopo-legend-dot" style={{ background: color }} />
                   <span>{label}</span>
                 </div>
               ))}
             </div>
             <div className="bdtopo-note">
               Cliquez sur un bâtiment pour ses détails.<br/>
               Données mises à jour automatiquement au déplacement.
             </div>
           </div>
         )}
       </div>
 
       {/* ── Panel WW3 ── */}
       <div className="ww3-panel">
         <div className="ww3-header">
           <div>
             <div className="ww3-title">Simulation vagues WW3</div>
             <div className="ww3-subtitle">R1141 · Charentes 200m · 02/04/2026</div>
           </div>
           <button className={`ww3-toggle-btn ${ww3Active ? 'active' : ''}`}
             onClick={toggleWW3} disabled={ww3Loading}>
             {ww3Loading ? '...' : ww3Active ? 'ON' : 'OFF'}
           </button>
         </div>
 
         {ww3Active && ww3Loaded && (
           <>
             {currentFrame && (
               <div className="ww3-stats">
                 <div className="ww3-stat">
                   <span className="ww3-stat-label">Heure</span>
                   <span className="ww3-stat-value">{currentFrame.ts.slice(11, 16)}</span>
                 </div>
                 <div className="ww3-stat">
                   <span className="ww3-stat-label">Hs max</span>
                   <span className="ww3-stat-value ww3-accent">{currentFrame.hs_max.toFixed(2)} m</span>
                 </div>
                 <div className="ww3-stat">
                   <span className="ww3-stat-label">Hs moy</span>
                   <span className="ww3-stat-value">{currentFrame.hs_mean.toFixed(2)} m</span>
                 </div>
                 <div className="ww3-stat">
                   <span className="ww3-stat-label">Pts actifs</span>
                   <span className="ww3-stat-value">{currentFrame.n_active.toLocaleString()}</span>
                 </div>
               </div>
             )}
 
             <div className="ww3-var-label">Variable affichée</div>
             <div className="ww3-var-btns">
               {(Object.keys(VAR_CONFIG) as WW3VarKey[]).map(k => (
                 <button key={k}
                   className={`ww3-var-btn ${ww3Var === k ? 'active' : ''}`}
                   onClick={() => changeWW3Var(k)}>
                   {VAR_CONFIG[k].label}
                 </button>
               ))}
             </div>
 
             <div className="ww3-option-row">
               <span className="ww3-stat-label">Flèches direction</span>
               <button className={`ww3-arrow-btn ${ww3Arrows ? 'active' : ''}`}
                 onClick={() => {
                   setWW3Arrows(prev => {
                     ww3ArrowRef.current = !prev
                     if (!prev) drawWW3Arrows()
                     else { const c = dirCanvas.current; if (c) c.getContext('2d')?.clearRect(0,0,c.width,c.height) }
                     return !prev
                   })
                 }}>
                 {ww3Arrows ? 'ON' : 'OFF'}
               </button>
             </div>
 
             <div className="ww3-timeline">
               <div className="ww3-ts">{currentFrame?.ts ?? '—'}</div>
               <div className="ww3-progress">
                 <div className="ww3-progress-fill"
                   style={{ width: nFrames > 0 ? `${((ww3Frame+1)/nFrames)*100}%` : '0%' }} />
               </div>
               <div className="ww3-controls">
                 <button className="ww3-ctrl-btn" onClick={() => stepWW3(-1)}>◀</button>
                 <button className={`ww3-ctrl-btn ${ww3Playing ? 'active' : ''}`} onClick={toggleWW3Play}>
                   {ww3Playing ? '⏸' : '▶'}
                 </button>
                 <button className="ww3-ctrl-btn" onClick={() => stepWW3(1)}>▶</button>
                 <span className="ww3-frame-count">{ww3Frame+1} / {nFrames}</span>
               </div>
             </div>
           </>
         )}
         {ww3Loading && <div className="ww3-loading">Chargement données WW3...</div>}
         {ww3Error   && <div className="ww3-error">{ww3Error}</div>}
       </div>
 
       {/* ── Panel impact submersion ── */}
       {showImpact && impact && (
         <div className="impact-panel">
           <div className="impact-header">
             <span className="impact-title">Impact estimé</span>
             <button className="impact-close" onClick={() => setShowImpact(false)}>✕</button>
           </div>
           <div className="impact-rows">
             <div className="impact-row">
               <span className="impact-label">Niveau d'eau</span>
               <span className="impact-value">{impact.niveau_m}m NGF</span>
             </div>
             <div className="impact-row">
               <span className="impact-label">Bâtiments touchés</span>
               <span className="impact-value impact-danger">
                 {impact.batiments_touches.toLocaleString('fr-FR')}
               </span>
             </div>
             <div className="impact-row">
               <span className="impact-label">Routes coupées</span>
               <span className="impact-value impact-warning">
                 {impact.routes_coupees.toLocaleString('fr-FR')}
               </span>
             </div>
             <div className="impact-row">
               <span className="impact-label">Surface inondée</span>
               <span className="impact-value">{(impact.surface_inondee_ha/100).toFixed(0)} km²</span>
             </div>
             <div className="impact-row">
               <span className="impact-label">Réseaux critiques</span>
               <span className="impact-value impact-danger">
                 {impact.reseaux_critiques.length > 0 ? impact.reseaux_critiques.join(', ') : 'Aucun'}
               </span>
             </div>
           </div>
         </div>
       )}
 
       {/* ── Légende WW3 ── */}
       <WW3Legend activeVar={ww3Var} visible={ww3Active} />
     </div>
   )
 }
 