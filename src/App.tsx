import { useState } from 'react'
import Map2D from './components/Map2D/Map2D'
import Map3D from './components/Map3D/Map3D'
import ViewToggle from './components/ViewToggle/ViewToggle'
import LayerControl from './components/LayerControl/LayerControl'
import Legend from './components/Legend/Legend'
import type { LayerId } from './types/layers.types'
import './App.css'

type View = '2d' | '3d'

export default function App() {
  const [view, setView] = useState<View>('2d')
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({
    'ppri-zones': true,
    'ppri-fill': true,
    'critical-networks-layer': true,
    'flood-tiles-layer': true,
  })

  const toggleLayer = (id: LayerId) => {
    setLayers(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Carte — plein écran */}
      {view === '2d' && <Map2D layers={layers} />}
      {view === '3d' && <Map3D />}

      {/* ViewToggle — toujours visible en haut à gauche */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100 }}>
        <ViewToggle current={view} onChange={setView} />
      </div>

      {/* Panels 2D uniquement */}
      {view === '2d' && (
        <>
          {/* Légende — bas gauche */}
          <div style={{
            position: 'absolute',
            bottom: 48,
            left: 16,
            zIndex: 10,
          }}>
            <Legend />
          </div>

          {/* LayerControl — bas droite */}
          <div style={{
            position: 'absolute',
            bottom: 48,
            right: 16,
            zIndex: 10,
          }}>
            <LayerControl layers={layers} onToggle={toggleLayer} />
          </div>
        </>
      )}
    </div>
  )
}