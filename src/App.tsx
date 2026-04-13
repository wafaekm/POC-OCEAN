import { useState } from 'react'
import Map2D from './components/Map2D/Map2D'
import Map3D from './components/Map3D/Map3D'
import ViewToggle from './components/ViewToggle/ViewToggle'
import LayerControl from './components/LayerControl/LayerControl'
import Legend from './components/Legend/Legend'
import ChatPanel from './components/Chat/ChatPanel'
import type { LayerId } from './types/layers.types'
import './App.css'

type View = '2d' | '3d'

export default function App() {
  const [view, setView]         = useState<View>('2d')
  const [chatOpen, setChatOpen] = useState(false)
  const [layers, setLayers]     = useState<Record<LayerId, boolean>>({
    'ppri-zones': true,
    'ppri-fill': true,
    'critical-networks-layer': true,
    'flood-tiles-layer': true,
  })

  const toggleLayer = (id: LayerId) => {
    setLayers(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const panelW = 400

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>

      {/* Carte — plein écran */}
      {view === '2d' && <Map2D layers={layers} />}
      {view === '3d' && <Map3D />}

      {/* ViewToggle — haut gauche */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100 }}>
        <ViewToggle current={view} onChange={setView} />
      </div>

      {/* Panels 2D */}
      {view === '2d' && (
        <>
          <div style={{ position: 'absolute', bottom: 48, left: 16, zIndex: 10 }}>
            <Legend />
          </div>
          <div style={{
            position: 'absolute', bottom: 48, zIndex: 10,
            right: chatOpen ? panelW + 16 : 16,
            transition: 'right 0.3s ease',
          }}>
            <LayerControl layers={layers} onToggle={toggleLayer} />
          </div>
        </>
      )}

      {/* ── Panneau chat ─────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 0, right: chatOpen ? 0 : -panelW,
        width: panelW, height: '100%', zIndex: 200,
        transition: 'right 0.3s ease',
        borderLeft: '1px solid rgba(34,211,238,0.18)',
        boxShadow: chatOpen ? '-8px 0 32px rgba(0,0,0,0.5)' : 'none',
      }}>
        {chatOpen && <ChatPanel />}
      </div>

      {/* ── Bouton flottant ───────────────────────────────────── */}
      <button
        onClick={() => setChatOpen(o => !o)}
        title={chatOpen ? 'Fermer le chatbot' : 'Ouvrir le chatbot'}
        style={{
          position: 'absolute', bottom: 24, zIndex: 300,
          right: chatOpen ? panelW + 16 : 16,
          transition: 'right 0.3s ease',
          width: 50, height: 50, borderRadius: '50%',
          border: '1.5px solid rgba(34,211,238,0.5)',
          background: chatOpen ? 'rgba(34,211,238,0.12)' : 'linear-gradient(135deg,#0891b2,#22d3ee)',
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
  )
}
