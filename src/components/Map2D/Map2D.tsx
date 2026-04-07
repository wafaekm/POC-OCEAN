import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './Map2D.css'
import type { LayerId } from '../../types/layers.types'

const LA_ROCHELLE_CENTER: [number, number] = [-1.1528, 46.1591]
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY

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

export default function Map2D({ layers }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const mapReady = useRef(false)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeScenario, setActiveScenario] = useState<string | null>(null)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [showImpact, setShowImpact] = useState(false)

  // Charge la liste des scénarios
  useEffect(() => {
    fetch('/data/scenarios/index.json')
      .then(r => r.json())
      .then(setScenarios)
      .catch(console.error)
  }, [])

  // Init carte
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
      center: LA_ROCHELLE_CENTER,
      zoom: 12,
    })

    const m = map.current
    m.addControl(new maplibregl.NavigationControl(), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    m.on('load', () => {
      // PPRI officiel
      m.addSource('ppri', {
        type: 'geojson',
        data: '/data/ppri.geojson'
      })
      m.addLayer({
        id: 'ppri-fill',
        type: 'fill',
        source: 'ppri',
        paint: {
          'fill-color': '#E24B4A',
          'fill-opacity': 0.25
        }
      })
      m.addLayer({
        id: 'ppri-zones',
        type: 'line',
        source: 'ppri',
        paint: {
          'line-color': '#E24B4A',
          'line-width': 1.5,
          'line-dasharray': [3, 2]
        }
      })

      // Réseaux critiques
      m.addSource('critical-networks', {
        type: 'geojson',
        data: '/data/critical_networks.geojson'
      })
      m.addLayer({
        id: 'critical-networks-layer',
        type: 'circle',
        source: 'critical-networks',
        paint: {
            'circle-radius': 6,
            'circle-color': [
                'match', ['get', 'category'],
                'eau', '#3498DB',
                'secours_sante', '#E74C3C',
                '#ffffff'
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5
        }
      })

      // Sources scénario (vides au départ)
      m.addSource('flood-tiles', {
        type: 'raster',
        tiles: [],
        tileSize: 256,
      })
      m.addLayer({
        id: 'flood-tiles-layer',
        type: 'raster',
        source: 'flood-tiles',
        paint: { 'raster-opacity': 0.65 },
        layout: { visibility: 'none' }
      })

      m.on('click', 'critical-networks-layer', (e) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:sans-serif;padding:4px">
              <strong>${props.nom || props.name || 'Réseau critique'}</strong><br/>
              <span style="font-size:12px;color:#666">
                Type : ${props.category || 'N/A'}
              </span>
            </div>
          `)
          .addTo(m)
      })

      m.on('mouseenter', 'critical-networks-layer', () => {
        m.getCanvas().style.cursor = 'pointer'
      })
      m.on('mouseleave', 'critical-networks-layer', () => {
        m.getCanvas().style.cursor = ''
      })

      new maplibregl.Marker({ color: '#E24B4A' })
        .setLngLat(LA_ROCHELLE_CENTER)
        .setPopup(new maplibregl.Popup().setHTML(
          '<strong>La Rochelle</strong><br/>Zone pilote POC Géo-Twin'
        ))
        .addTo(m)

      mapReady.current = true
    })

    return () => { map.current?.remove(); map.current = null }
  }, [])

  // Sync visibilité couches
  useEffect(() => {
    if (!mapReady.current || !map.current) return
    const m = map.current
    Object.entries(layers).forEach(([id, visible]) => {
      if (m.getLayer(id)) {
        m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
      }
    })
  }, [layers])

  // Charge un scénario
  const loadScenario = async (scenarioId: string) => {
    const m = map.current
    if (!m || !mapReady.current) return

    setActiveScenario(scenarioId)
    setShowImpact(false)

    // Charge impact.json
    try {
      const imp = await fetch(`/data/scenarios/${scenarioId}/impact.json`)
        .then(r => r.json())
      setImpact(imp)
      setShowImpact(true)
    } catch (e) {
      console.warn('impact.json non trouvé')
    }

    const tilesUrl = `/data/scenarios/${scenarioId}/tiles/{z}/{x}/{y}.png`
    const src = m.getSource('flood-tiles') as maplibregl.RasterTileSource
    if (src) {
      ;(src as any).setTiles([tilesUrl])
      m.setLayoutProperty('flood-tiles-layer', 'visibility', 'visible')
    }
  }

  const clearScenario = () => {
    const m = map.current
    if (!m) return
    setActiveScenario(null)
    setImpact(null)
    setShowImpact(false)
    ;(m.getSource('flood-zones') as maplibregl.GeoJSONSource)
      ?.setData({ type: 'FeatureCollection', features: [] })
    m.setLayoutProperty('flood-tiles-layer', 'visibility', 'none')
  }

  return (
  <div ref={mapContainer} style={{ width: '100%', height: '100%' }}>

    {/* Panel scénarios — en haut, décalé pour ne pas masquer ViewToggle */}
    <div className="scenario-panel">
      <div className="scenario-title">Scénarios de submersion</div>
      <div className="scenario-list">
        {scenarios.map(s => (
          <button
            key={s.id}
            className={`scenario-btn ${activeScenario === s.id ? 'active' : ''}`}
            onClick={() =>
              activeScenario === s.id ? clearScenario() : loadScenario(s.id)
            }
          >
            <span className="scenario-label">{s.label}</span>
            <span className="scenario-niveau">+{s.niveau_m}m</span>
          </button>
        ))}
      </div>

      {/* Bouton reset */}
      {activeScenario && (
        <button className="scenario-reset" onClick={clearScenario}>
          ↺ Réinitialiser
        </button>
      )}
    </div>

    {/* Panel impact — à droite, au-dessus du LayerControl */}
    {showImpact && impact && (
      <div className="impact-panel">
        <div className="impact-header">
          <span className="impact-title">Impact estimé</span>
          <button
            className="impact-close"
            onClick={() => setShowImpact(false)}
          >✕</button>
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
            <span className="impact-value">
              {(impact.surface_inondee_ha / 100).toFixed(0)} km²
            </span>
          </div>
          <div className="impact-row">
            <span className="impact-label">Réseaux critiques</span>
            <span className="impact-value impact-danger">
              {impact.reseaux_critiques.length > 0
                ? impact.reseaux_critiques.join(', ')
                : 'Aucun'}
            </span>
          </div>
        </div>
      </div>
    )}
  </div>
)
}