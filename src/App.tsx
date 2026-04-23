import { useState, useCallback } from 'react'
import './styles/global.css'

import Topbar, { type ViewId } from './components/Topbar/Topbar'
import Sidebar from './components/Sidebar/Sidebar'
import RightPanel from './components/RightPanel/RightPanel'
import ChatPanel from './components/Chat/ChatPanel'

import Map2D from './components/Map2D/Map2D'
import Map3D from './components/Map3D/Map3D'
import LaRochelleWaveView from './components/LaRochelleWaveView'
import LaRochelleLidarTilesView from './components/LaRochelleLidarTilesView'
import LaRochelleAisLiveView from './components/LaRochelleAisLiveView'

import type { LayerId } from './types/layers.types'

type RightMode = 'analysis' | 'assistant'

const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  'ppri-fill': true,
  'ppri-zones': true,
  'critical-networks-layer': true,
  'flood-tiles-layer': false,
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>('map2d')
  const [layers, setLayers] = useState(DEFAULT_LAYERS)

  const [bdtopoActive, setBdtopoActive] = useState(false)
  const [bdtopoCount, setBdtopoCount] = useState(0)

  const [scenarios, setScenarios] = useState<any[]>([])
  const [activeScenario, setActiveScenario] = useState<string | null>(null)
  const [impact, setImpact] = useState<any | null>(null)

  const [ww3Active, setWw3Active] = useState(false)
  const [ww3Loading, setWw3Loading] = useState(false)
  const [ww3Frame, setWw3Frame] = useState(0)
  const [ww3Var, setWw3Var] = useState<any>('hs')
  const [ww3Playing, setWw3Playing] = useState(false)
  const [ww3Arrows, setWw3Arrows] = useState(true)
  const [ww3FrameData, setWw3FrameData] = useState<any | null>(null)
  const [nFrames, setNFrames] = useState(0)

  const [map2dRef, setMap2dRef] = useState<any>(null)
  const [rightMode, setRightMode] = useState<RightMode>('analysis')

  const handleLayerToggle = useCallback((id: LayerId) => {
    setLayers(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleViewChange = useCallback((id: ViewId) => {
    setActiveView(id)
  }, [])

  const handleBdtopoToggle = useCallback(() => {
    map2dRef?.toggleBdtopo?.()
  }, [map2dRef])

  const handleLoadScenario = useCallback((id: string) => {
    map2dRef?.loadScenario?.(id)
  }, [map2dRef])

  const handleClearScenario = useCallback(() => {
    map2dRef?.clearScenario?.()
  }, [map2dRef])

  const handleToggleWW3 = useCallback(() => {
    map2dRef?.toggleWW3?.()
  }, [map2dRef])

  const handleChangeWW3Var = useCallback((k: any) => {
    map2dRef?.changeWW3Var?.(k)
  }, [map2dRef])

  const handleToggleWW3Play = useCallback(() => {
    map2dRef?.toggleWW3Play?.()
  }, [map2dRef])

  const handleStepWW3 = useCallback((delta: number) => {
    map2dRef?.stepWW3?.(delta)
  }, [map2dRef])

  const handleToggleWW3Arrows = useCallback(() => {
    map2dRef?.toggleWW3Arrows?.()
  }, [map2dRef])

  const map2dCallbacks = {
    onScenariosLoaded: setScenarios,
    onScenarioChange: setActiveScenario,
    onImpactChange: setImpact,
    onBdtopoChange: (active: boolean, count: number) => {
      setBdtopoActive(active)
      setBdtopoCount(count)
    },
    onWW3StateChange: (state: {
      active: boolean
      loading: boolean
      frame: number
      var: any
      playing: boolean
      arrows: boolean
      frameData: any
      nFrames: number
    }) => {
      setWw3Active(state.active)
      setWw3Loading(state.loading)
      setWw3Frame(state.frame)
      setWw3Var(state.var)
      setWw3Playing(state.playing)
      setWw3Arrows(state.arrows)
      setWw3FrameData(state.frameData)
      setNFrames(state.nFrames)
    },
  }

  const renderView = () => {
    switch (activeView) {
      case 'map2d':
        return (
          <Map2D
            layers={layers}
            callbacks={map2dCallbacks}
            onRef={setMap2dRef}
          />
        )
      case 'flood':
        return <Map3D />
      case 'ww3':
        return <LaRochelleWaveView onBack={() => setActiveView('map2d')} />
      case 'lidar':
        return <LaRochelleLidarTilesView onBack={() => setActiveView('map2d')} />
      case 'ais':
        return <LaRochelleAisLiveView onBack={() => setActiveView('map2d')} />
      default:
        return null
    }
  }

  const showContextPanel = activeView === 'map2d'

  return (
    <div className="app-shell">
      <Topbar activeView={activeView} onViewChange={handleViewChange} />

      <div className="app-body">
        <Sidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          layers={layers}
          onLayerToggle={handleLayerToggle}
          bdtopoActive={bdtopoActive}
          bdtopoCount={bdtopoCount}
          onBdtopoToggle={handleBdtopoToggle}
        />

        <main className="view-area" style={{ flex: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
          {renderView()}

          {activeView === 'map2d' && (
            <button
              onClick={() => setRightMode(prev => prev === 'assistant' ? 'analysis' : 'assistant')}
              className={`chat-fab ${rightMode === 'assistant' ? 'active' : ''}`}
              title={rightMode === 'assistant' ? 'Fermer l’assistant' : 'Ouvrir l’assistant'}
              aria-label={rightMode === 'assistant' ? 'Fermer l’assistant' : 'Ouvrir l’assistant'}
              type="button"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {rightMode === 'assistant' ? (
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>

              {rightMode !== 'assistant' && <span className="chat-fab-dot" />}
            </button>
          )}
        </main>

        {showContextPanel && (
          <aside className="context-panel">
            <div className="context-panel-header">
              <div className="context-panel-tabs">
                <button
                  className={`context-tab ${rightMode === 'analysis' ? 'active' : ''}`}
                  onClick={() => setRightMode('analysis')}
                  type="button"
                >
                  Analyse
                </button>

                <button
                  className={`context-tab ${rightMode === 'assistant' ? 'active' : ''}`}
                  onClick={() => setRightMode('assistant')}
                  type="button"
                >
                  Assistant
                </button>
              </div>
            </div>

            <div className="context-panel-body">
              {rightMode === 'analysis' ? (
                <RightPanel
                  scenarios={scenarios}
                  activeScenario={activeScenario}
                  impact={impact}
                  onLoadScenario={handleLoadScenario}
                  onClearScenario={handleClearScenario}
                  ww3Active={ww3Active}
                  ww3Loading={ww3Loading}
                  ww3Frame={ww3Frame}
                  ww3Var={ww3Var}
                  ww3Playing={ww3Playing}
                  ww3Arrows={ww3Arrows}
                  currentFrame={ww3FrameData}
                  nFrames={nFrames}
                  onToggleWW3={handleToggleWW3}
                  onChangeWW3Var={handleChangeWW3Var}
                  onToggleWW3Play={handleToggleWW3Play}
                  onStepWW3={handleStepWW3}
                  onToggleWW3Arrows={handleToggleWW3Arrows}
                />
              ) : (
                <div className="context-chat-wrap">
                  <ChatPanel />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}