import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './Map2D.css'
import type { LayerId } from '../../types/layers.types'

const LA_ROCHELLE_CENTER: [number, number] = [-1.1528, 46.1591]
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY

interface Props {
  layers: Record<LayerId, boolean>
}

export default function Map2D({ layers }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const mapReady = useRef(false)

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
      m.addSource('shom-wms', {
        type: 'raster',
        tiles: [
          'https://wms.gebco.net/mapserv?' +
          'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
          '&LAYERS=GEBCO_LATEST' +
          '&FORMAT=image/png&TRANSPARENT=true' +
          '&WIDTH=256&HEIGHT=256&CRS=EPSG:3857' +
          '&BBOX={bbox-epsg-3857}'
        ],
        tileSize: 256,
        attribution: '© GEBCO 2024'
      })
      m.addLayer({
        id: 'shom-bathymetrie',
        type: 'raster',
        source: 'shom-wms',
        paint: { 'raster-opacity': 0.25 } 
      })

      m.addSource('ppri', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { niveau: 'fort', label: 'Zone submersion forte' },
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [-1.18, 46.14], [-1.16, 46.14], [-1.14, 46.15],
                  [-1.13, 46.17], [-1.14, 46.19], [-1.16, 46.20],
                  [-1.18, 46.19], [-1.20, 46.17], [-1.20, 46.15],
                  [-1.18, 46.14]
                ]]
              }
            },
            {
              type: 'Feature',
              properties: { niveau: 'moyen', label: 'Zone submersion modérée' },
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [-1.22, 46.13], [-1.18, 46.13], [-1.14, 46.14],
                  [-1.12, 46.16], [-1.12, 46.20], [-1.15, 46.22],
                  [-1.20, 46.22], [-1.23, 46.20], [-1.24, 46.17],
                  [-1.22, 46.13]
                ]]
              }
            }
          ]
        }
      })

      m.addLayer({
        id: 'ppri-fill',
        type: 'fill',
        source: 'ppri',
        paint: {
          'fill-color': ['match', ['get', 'niveau'],
            'fort', '#E24B4A', 'moyen', '#EF9F27', '#378ADD'],
          'fill-opacity': 0.35
        }
      })

      m.addLayer({
        id: 'ppri-zones',
        type: 'line',
        source: 'ppri',
        paint: {
          'line-color': ['match', ['get', 'niveau'],
            'fort', '#E24B4A', 'moyen', '#EF9F27', '#378ADD'],
          'line-width': 2
        }
      })

      m.on('click', 'ppri-fill', (e) => {
        const props = e.features?.[0]?.properties
        if (!props) return
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-family:sans-serif;padding:4px">
            <strong>${props.label}</strong><br/>
            <span style="font-size:12px;color:#666">
              Risque de submersion marine<br/>Référence : tempête Xynthia 2010
            </span>
          </div>`)
          .addTo(m)
      })

      m.on('mouseenter', 'ppri-fill', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', 'ppri-fill', () => { m.getCanvas().style.cursor = '' })

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

  useEffect(() => {
    if (!mapReady.current || !map.current) return
    const m = map.current
    Object.entries(layers).forEach(([id, visible]) => {
      if (m.getLayer(id)) {
        m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
      }
    })
  }, [layers])

  return (
    <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
  )
}