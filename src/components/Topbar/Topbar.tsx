import './Topbar.css'

export type ViewId =
  | 'map2d'
  | 'flood'
  | 'ww3'
  | 'lidar'
  | 'ais'

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'map2d',  label: 'Carte 2D' },
  { id: 'flood',  label: 'Simulation 3D' },
  { id: 'ww3',    label: 'Houle WW3' },
  { id: 'lidar',  label: 'LiDAR' },
  { id: 'ais',    label: 'AIS Live' },
]

interface Props {
  activeView: ViewId
  onViewChange: (id: ViewId) => void
}

export default function Topbar({ activeView, onViewChange }: Props) {
  return (
    <header className="topbar">
      {/* ── Logo Atos + identité POC ── */}
      <div className="topbar-brand">
        <div className="brand-logo-wrap">
          <AtosLogo />
          <div className="brand-divider" />
          <div className="brand-info">
            <span className="brand-name">POC Océan</span>
            <span className="brand-sub">Géo-Twin Littoral</span>
          </div>
        </div>
      </div>

      {/* ── Onglets de navigation (centré) ── */}
      <nav className="topbar-nav" aria-label="Vues principales">
        {VIEWS.map(view => (
          <button
            key={view.id}
            className={`nav-tab ${activeView === view.id ? 'active' : ''}`}
            onClick={() => onViewChange(view.id)}
            aria-current={activeView === view.id ? 'page' : undefined}
          >
            {view.label}
            {activeView === view.id && <span className="tab-indicator" />}
          </button>
        ))}
      </nav>

      {/* ── Statut + zone ── */}
      <div className="topbar-status">
        <span className="status-dot" aria-hidden />
        <span className="status-text">Données actives</span>
        <div className="status-divider" />
        <span className="status-zone">La Rochelle</span>
      </div>
    </header>
  )
}

/* Atos SVG Logo — tracé fidèle couleur brand */
function AtosLogo() {
  return (
    <svg
      className="atos-logo"
      viewBox="0 0 90 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Atos"
      role="img"
    >
      {/* A */}
      <path
        d="M4 28L12 8L20 28H17.2L15.2 23H8.8L6.8 28H4ZM9.8 20.5H14.2L12 14.5L9.8 20.5Z"
        fill="#0099FF"
      />
      {/* t */}
      <path
        d="M22 12H25V15H28V17.5H25V23C25 24.1 25.4 24.5 26.5 24.5H28V27H25.8C23.1 27 22 25.9 22 23.2V17.5H20V15H22V12Z"
        fill="#0099FF"
      />
      {/* o (cercle avec encoche) */}
      <path
        d="M38 14.5C42.1 14.5 45.5 17.4 45.5 21C45.5 24.6 42.1 27.5 38 27.5C33.9 27.5 30.5 24.6 30.5 21C30.5 17.4 33.9 14.5 38 14.5ZM38 17C35.4 17 33.2 18.8 33.2 21C33.2 23.2 35.4 25 38 25C40.6 25 42.8 23.2 42.8 21C42.8 18.8 40.6 17 38 17Z"
        fill="#0099FF"
      />
      {/* encoche du o */}
      <path
        d="M38 17C39.8 17 41.4 17.9 42.3 19.2L38 21L38 14.5C37.5 14.5 37 14.55 36.5 14.65L36.5 17.15C37 17.05 37.5 17 38 17Z"
        fill="#07090f"
      />
      {/* S */}
      <path
        d="M47 23.5C47.8 25.2 49.6 27 52.5 27C55.4 27 57.5 25.2 57.5 22.8C57.5 20.4 55.8 19.4 53.2 18.6C51.4 18 50.5 17.5 50.5 16.5C50.5 15.5 51.4 14.8 52.5 14.8C53.6 14.8 54.5 15.4 55 16.3L57.2 15C56.2 13.4 54.5 12.5 52.5 12.5C50 12.5 48 14.2 48 16.5C48 18.8 49.5 19.8 52.2 20.7C54.1 21.3 55 21.9 55 23C55 24.1 54.1 24.8 52.8 24.8C51.3 24.8 50.2 24 49.3 22.5L47 23.5Z"
        fill="#0099FF"
      />
    </svg>
  )
}
