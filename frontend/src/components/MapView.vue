<template>
  <div class="map-outer">
    <div ref="mapContainer" class="map-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'

const props = defineProps({
  visual: { type: Object, required: true },
})

const mapContainer = ref(null)
let map = null

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }],
}

function addDataLayer(layerType, geojson) {
  map.addSource('data', { type: 'geojson', data: geojson })

  if (layerType === 'fill') {
    map.addLayer({
      id: 'data-fill',
      type: 'fill',
      source: 'data',
      paint: {
        'fill-color': 'rgba(0, 150, 255, 0.4)',
        'fill-outline-color': 'rgba(255, 255, 255, 0.85)',
      },
    })
    map.addLayer({
      id: 'data-fill-outline',
      type: 'line',
      source: 'data',
      paint: { 'line-color': 'rgba(255,255,255,0.7)', 'line-width': 1.5 },
    })
  } else if (layerType === 'circle') {
    map.addLayer({
      id: 'data-circles',
      type: 'circle',
      source: 'data',
      paint: {
        'circle-radius': 10,
        'circle-color': [
          'match', ['get', 'risk'],
          'élevé',  '#ef4444',
          'modéré', '#f97316',
          '#22d3ee',
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.88,
      },
    })

    map.on('click', 'data-circles', (e) => {
      const p = e.features[0].properties
      new maplibregl.Popup({ offset: 14, closeButton: true })
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${p.name}</strong><br>` +
          `<span style="color:#94b4cc">${p.type}</span><br>` +
          `Risque : <b>${p.risk}</b>`
        )
        .addTo(map)
    })
    map.on('mouseenter', 'data-circles', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'data-circles', () => { map.getCanvas().style.cursor = '' })

  } else if (layerType === 'line') {
    map.addLayer({
      id: 'data-line',
      type: 'line',
      source: 'data',
      paint: { 'line-color': '#f97316', 'line-width': 3 },
    })
  }
}

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: OSM_STYLE,
    center: props.visual.center,
    zoom: props.visual.zoom,
    attributionControl: false,
  })
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

  map.on('load', () => addDataLayer(props.visual.layer_type, props.visual.geojson))
})

onUnmounted(() => {
  map?.remove()
  map = null
})
</script>

<style scoped>
.map-outer {
  margin-top: 10px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(34, 211, 238, 0.22);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.map-container {
  width: 100%;
  height: 300px;
}
</style>

<!-- Global : surcharge du thème clair natif MapLibre -->
<style>
.maplibregl-popup-content {
  background: #0d2240 !important;
  color: #d8eef9 !important;
  border: 1px solid rgba(34, 211, 238, 0.3) !important;
  border-radius: 8px !important;
  padding: 10px 14px !important;
  font-family: 'Segoe UI', system-ui, sans-serif !important;
  font-size: 0.82rem !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5) !important;
}
.maplibregl-popup-tip {
  border-top-color: #0d2240 !important;
  border-bottom-color: #0d2240 !important;
}
.maplibregl-popup-close-button {
  color: #67b8cc !important;
  font-size: 1rem !important;
}
.maplibregl-ctrl-group {
  background: rgba(13, 34, 64, 0.9) !important;
  border: 1px solid rgba(34, 211, 238, 0.2) !important;
}
.maplibregl-ctrl-group button {
  background-color: transparent !important;
  color: #22d3ee !important;
}
</style>
