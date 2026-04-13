import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface Visual {
  geojson: object
  center: [number, number]
  zoom: number
  layer_type: 'circle' | 'fill' | 'line'
}

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster' as const, source: 'osm' }],
}

export default function ChatMapView({ visual }: { visual: Visual }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: visual.center,
      zoom: visual.zoom,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      map.addSource('data', { type: 'geojson', data: visual.geojson as GeoJSON.FeatureCollection })

      if (visual.layer_type === 'fill') {
        map.addLayer({ id: 'data-fill', type: 'fill', source: 'data',
          paint: { 'fill-color': 'rgba(0,150,255,0.4)', 'fill-outline-color': 'rgba(255,255,255,0.85)' } })
        map.addLayer({ id: 'data-outline', type: 'line', source: 'data',
          paint: { 'line-color': 'rgba(255,255,255,0.7)', 'line-width': 1.5 } })

      } else if (visual.layer_type === 'circle') {
        map.addLayer({ id: 'data-circles', type: 'circle', source: 'data',
          paint: {
            'circle-radius': 10,
            'circle-color': ['match', ['get', 'risk'], 'élevé', '#ef4444', 'modéré', '#f97316', '#22d3ee'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.88,
          },
        })
        map.on('click', 'data-circles', (e) => {
          const p = e.features?.[0]?.properties ?? {}
          new maplibregl.Popup({ offset: 14 })
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${p.name ?? ''}</strong><br><span style="color:#94b4cc">${p.type ?? ''}</span>`)
            .addTo(map)
        })
        map.on('mouseenter', 'data-circles', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'data-circles', () => { map.getCanvas().style.cursor = '' })

      } else {
        map.addLayer({ id: 'data-line', type: 'line', source: 'data',
          paint: { 'line-color': '#f97316', 'line-width': 3 } })
      }
    })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  return (
    <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(34,211,238,0.22)', boxShadow: '0 4px 20px rgba(0,0,0,0.35)' }}>
      <div ref={containerRef} style={{ width: '100%', height: 280 }} />
    </div>
  )
}
