import { useState } from 'react'
import MuncieFloodView from '../MuncieFloodView'
import LaRochelleWaveView from '../LaRochelleWaveView'
import './Map3D.css'

type SceneMode = 'selector' | 'muncie' | 'larochelle'

export default function Map3D() {
  const [mode, setMode] = useState<SceneMode>('selector')

  if (mode === 'muncie') {
    return (
      <div className="map3d-wrapper">
        <MuncieFloodView onBack={() => setMode('selector')} />
      </div>
    )
  }

  if (mode === 'larochelle') {
    return (
      <div className="map3d-wrapper">
        <LaRochelleWaveView onBack={() => setMode('selector')} />
      </div>
    )
  }

  return (
    <div className="map3d-wrapper scenario-selector-screen">
      <div className="scenario-selector-card">
        <div className="scenario-selector-title">Choisir une scène</div>
        <div className="scenario-selector-subtitle">
          Sélectionne la visualisation à ouvrir
        </div>

        <div className="scenario-selector-actions">
          <button
            className="scenario-selector-btn"
            onClick={() => setMode('muncie')}
          >
            Muncie — Inondation HEC-RAS
          </button>

          <button
            className="scenario-selector-btn"
            onClick={() => setMode('larochelle')}
          >
            La Rochelle — Houle WW3
          </button>
        </div>
      </div>
    </div>
  )
}