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
    'shom-bathymetrie': false,
    'ppri-zones': true,
    'ppri-fill': true,
  })

  const toggleLayer = (id: LayerId) => {
    setLayers(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <ViewToggle current={view} onChange={setView} />
      {view === '2d' && <Map2D layers={layers} />}
      {view === '3d' && <Map3D />}
      {view === '2d' && <Legend />}
      {view === '2d' && <LayerControl layers={layers} onToggle={toggleLayer} />}
    </div>
  )
}