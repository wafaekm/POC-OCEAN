import { useState } from 'react'
import LaRochelleWaveView from './LaRochelleWaveView'
import LaRochelleFloodView from './LaRochelleFloodView'
import './Map3D/Map3D.css'

type Props = {
  onBack: () => void
}

type Mode = 'selector' | 'wave' | 'flood'

export default function LaRochelleScenarioView({ onBack }: Props) {
  const [mode, setMode] = useState<Mode>('selector')

  if (mode === 'wave') {
    return <LaRochelleWaveView onBack={() => setMode('selector')} />
  }

  if (mode === 'flood') {
    return <LaRochelleFloodView onBack={() => setMode('selector')} />
  }

  return (
    <div className="map3d-wrapper scenario-selector-screen">
      <button className="scene-back-btn" onClick={onBack}>
        ← Retour
      </button>

      <div className="scenario-selector-card">
        <div className="scenario-selector-title">La Rochelle</div>
        <div className="scenario-selector-subtitle">
          Choisis le type de simulation
        </div>

        <div className="scenario-selector-actions">
          <button
            className="scenario-selector-btn"
            onClick={() => setMode('wave')}
          >
            Houle WW3
          </button>

          <button
            className="scenario-selector-btn"
            onClick={() => setMode('flood')}
          >
            Inondation urbaine — Xynthia
          </button>
        </div>
      </div>
    </div>
  )
}