import type { LayerId } from '../../types/layers.types'
import type { ViewId } from '../Topbar/Topbar'
import './Sidebar.css'

/* ── Icônes vues ── */
const VIEW_ICONS: Record<ViewId, { symbol: string; cls: string; label: string }> = {
  map2d:  { symbol: '2D', cls: 'icon-2d',    label: 'Carte risques 2D' },
  flood:  { symbol: '~',  cls: 'icon-flood',  label: 'Inondation Xynthia 3D' },
  ww3:    { symbol: '≈',  cls: 'icon-ww3',    label: 'Houle WW3 surface' },
  lidar:  { symbol: '▲',  cls: 'icon-lidar',  label: 'LiDAR 3D Tiles' },
  ais:    { symbol: '●',  cls: 'icon-ais',    label: 'AIS temps réel' },
}

const VIEWS: ViewId[] = ['map2d', 'flood', 'ww3', 'lidar', 'ais']

/* ── Couches 2D ── */
interface LayerDef {
  id: LayerId
  label: string
  color: string
}

const LAYER_DEFS: LayerDef[] = [
  { id: 'ppri-fill',              label: 'Zones PPRI',       color: '#E24B4A' },
  { id: 'ppri-zones',             label: 'Contours PPRI',    color: '#E24B4A' },
  { id: 'critical-networks-layer',label: 'Réseaux critiques',color: '#3498DB' },
  { id: 'flood-tiles-layer',      label: 'Submersion tuiles',color: '#378ADD' },
]

interface Props {
  activeView: ViewId
  onViewChange: (id: ViewId) => void
  layers: Record<LayerId, boolean>
  onLayerToggle: (id: LayerId) => void
  bdtopoActive: boolean
  bdtopoCount: number
  onBdtopoToggle: () => void
}

export default function Sidebar({
  activeView,
  onViewChange,
  layers,
  onLayerToggle,
  bdtopoActive,
  bdtopoCount,
  onBdtopoToggle,
}: Props) {
  return (
    <aside className="sidebar" aria-label="Navigation et couches">

      {/* ── Vues disponibles ── */}
      <div className="sidebar-section">
        <div className="section-label">Vues</div>
        {VIEWS.map(id => {
          const icon = VIEW_ICONS[id]
          return (
            <button
              key={id}
              className={`view-btn ${activeView === id ? 'active' : ''}`}
              onClick={() => onViewChange(id)}
              aria-current={activeView === id ? 'page' : undefined}
            >
              <span className={`view-icon ${icon.cls}`}>{icon.symbol}</span>
              <span className="view-label">{icon.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Couches (seulement en vue 2D) ── */}
      {activeView === 'map2d' && (
        <div className="sidebar-section fade-in">
          <div className="section-label">Couches</div>

          {LAYER_DEFS.map(({ id, label, color }) => (
            <div className="layer-row" key={id}>
              <div className="layer-left">
                <span className="layer-dot" style={{ background: color }} />
                <span className="layer-label">{label}</span>
              </div>
              <Toggle
                on={layers[id]}
                onChange={() => onLayerToggle(id)}
                aria-label={`Afficher ${label}`}
              />
            </div>
          ))}

          {/* Bâtiments BD TOPO */}
          <div className="layer-row">
            <div className="layer-left">
              <span className="layer-dot" style={{ background: '#6adc88' }} />
              <span className="layer-label">Bâtiments 3D</span>
            </div>
            <Toggle on={bdtopoActive} onChange={onBdtopoToggle} aria-label="Afficher les bâtiments 3D" />
          </div>

          {bdtopoActive && bdtopoCount > 0 && (
            <div className="bdtopo-count fade-in">
              <span className="bdtopo-count-val">{bdtopoCount.toLocaleString('fr-FR')}</span>
              <span className="bdtopo-count-label"> bâtiments chargés</span>
            </div>
          )}
        </div>
      )}

      {/* ── Sources de données ── */}
      <div className="sidebar-section sidebar-sources">
        <div className="section-label">Sources</div>
        <div className="source-list">
          {[
            'IGN · BD TOPO®',
            'SHOM · Géoplateforme',
            'OpenStreetMap',
            'Mercator Ocean',
            'WAVEWATCH III',
          ].map(s => (
            <div key={s} className="source-item">{s}</div>
          ))}
        </div>
      </div>

    </aside>
  )
}

/* ── Toggle component ── */
interface ToggleProps {
  on: boolean
  onChange: () => void
  'aria-label'?: string
}

function Toggle({ on, onChange, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={onChange}
    >
      <span className="toggle-thumb" />
    </button>
  )
}
