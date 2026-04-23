import { useState } from 'react'
import MuncieFloodView from '../MuncieFloodView'
import LaRochelleScenarioView from '../LaRochelleScenarioView'
import './Map3D.css'

type Scene = 'selector' | 'muncie' | 'larochelle'

const SCENES: Array<{
  key: Exclude<Scene, 'selector'>
  label: string
  sub: string
  meta: string
}> = [
  {
    key: 'muncie',
    label: 'Muncie — HEC-RAS',
    sub: 'Maillage continu avec eau animée et lecture temporelle',
    meta: 'Hydraulique fluviale',
  },
  {
    key: 'larochelle',
    label: 'La Rochelle — Xynthia',
    sub: 'Submersion urbaine 3D avec impact bâtiments',
    meta: 'Risque littoral',
  },
]

export default function Map3D() {
  const [scene, setScene] = useState<Scene>('selector')

  if (scene === 'muncie') {
    return (
      <div className="map3d-wrapper">
        <MuncieFloodView onBack={() => setScene('selector')} />
      </div>
    )
  }

  if (scene === 'larochelle') {
    return (
      <div className="map3d-wrapper">
        <LaRochelleScenarioView onBack={() => setScene('selector')} />
      </div>
    )
  }

  return (
    <div className="map3d-wrapper scene-selector-shell">
      <div className="scene-selector-card">
        <div className="scene-selector-head">
          <span className="scene-selector-kicker">Simulation 3D</span>
          <h1 className="scene-selector-title">Choix du scénario</h1>
          <p className="scene-selector-subtitle">
            Sélectionne le modèle à explorer dans la vue immersive.
          </p>
        </div>

        <div className="scene-selector-actions">
          {SCENES.map(item => (
            <button
              key={item.key}
              type="button"
              className="scene-selector-option"
              onClick={() => setScene(item.key)}
            >
              <div className="scene-selector-option-top">
                <span className="scene-selector-option-title">{item.label}</span>
                <span className="scene-selector-option-badge">{item.meta}</span>
              </div>

              <span className="scene-selector-option-sub">{item.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}