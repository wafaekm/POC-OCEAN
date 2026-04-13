import { useState, useRef, useEffect, useCallback } from 'react'
import Map2D from './components/Map2D/Map2D'
import Map3D from './components/Map3D/Map3D'
import ViewToggle from './components/ViewToggle/ViewToggle'
import LayerControl from './components/LayerControl/LayerControl'
import Legend from './components/Legend/Legend'
import ChatPanel from './components/Chat/ChatPanel'
import type { LayerId } from './types/layers.types'
import './App.css'

type View = '2d' | '3d'

const PANEL_MIN = 320
const PANEL_MAX = 700
const PANEL_DEFAULT = 400

export default function App() {
  const [view, setView]         = useState<View>('2d')
  const [chatOpen, setChatOpen] = useState(false)
  const [panelW, setPanelW]     = useState(PANEL_DEFAULT)
  const [layers, setLayers]     = useState<Record<LayerId, boolean>>({
    'ppri-zones': true,
    'ppri-fill': true,
    'critical-networks-layer': true,
    'flood-tiles-layer': true,
  })

  const dragging  = useRef(false)
  const startX    = useRef(0)
  const startW    = useRef(0)

  const toggleLayer = (id: LayerId) =>
    setLayers(prev => ({ ...prev, [id]: !prev[id] }))

  // Notifie MapLibre du changement de taille après transition
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 320)
    return () => clearTimeout(t)
  }, [chatOpen, panelW])

  // ── Resize handle ──────────────────────────────────────────
  const onDragMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const delta = startX.current - e.clientX
    setPanelW(Math.max(PANEL_MIN, Math.min(PANEL_MAX, startW.current + delta)))
  }, [])

  const onDragEnd = useCallback(() => {
    dragging.current = false
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [onDragMove])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current   = e.clientX
    startW.current   = panelW
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [panelW, onDragMove, onDragEnd])

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ── Zone carte ────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>

        {view === '2d' && <Map2D layers={layers} />}
        {view === '3d' && <Map3D />}

        {/* ViewToggle — haut gauche */}
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100 }}>
          <ViewToggle current={view} onChange={setView} />
        </div>

        {/* Bas droite — LayerControl + Legend */}
        {view === '2d' && (
          <div style={{
            position: 'absolute', bottom: 36, right: 16, zIndex: 100,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10,
          }}>
            <LayerControl layers={layers} onToggle={toggleLayer} />
            <Legend />
          </div>
        )}

        {/* Bouton chat — milieu droit, entre bdtopo-panel et LayerControl */}
        <button
          onClick={() => setChatOpen(o => !o)}
          title={chatOpen ? 'Fermer le chatbot' : 'Ouvrir le chatbot'}
          style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 16, zIndex: 100,
            width: 50, height: 50, borderRadius: '50%',
            border: '1.5px solid rgba(34,211,238,0.5)',
            background: chatOpen
              ? 'rgba(34,211,238,0.12)'
              : 'linear-gradient(135deg,#0891b2,#22d3ee)',
            color: chatOpen ? '#22d3ee' : '#040d1f',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          {chatOpen
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </button>

      </div>

      {/* ── Panneau chat (flex column, pas de superposition) ──── */}
      {chatOpen && (
        <div style={{
          width: panelW, flexShrink: 0, position: 'relative',
          borderLeft: '1px solid rgba(34,211,238,0.18)',
          boxShadow: '-6px 0 28px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Poignée de redimensionnement */}
          <div
            onMouseDown={onDragStart}
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
              cursor: 'col-resize', zIndex: 10,
              background: 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,211,238,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          />
          <ChatPanel />
        </div>
      )}

    </div>
  )
}
