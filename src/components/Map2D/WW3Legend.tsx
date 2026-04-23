import { useEffect, useState } from 'react'
import './WW3Legend.css'

type WW3VarKey = 'hs' | 'tp' | 'dir' | 'phs0' | 'ptp0'

interface LegendStop {
  value: string
  color: string
  label: string
}

interface VarLegend {
  key: WW3VarKey
  shortName: string
  fullName: string
  unit: string
  description: string
  stops: LegendStop[]
  note?: string
}

const LEGENDS: VarLegend[] = [
  {
    key: 'hs',
    shortName: 'Hs',
    fullName: 'Hauteur significative',
    unit: 'm',
    description: 'Moyenne du tiers supérieur des vagues. Indicateur principal de l’état de la mer.',
    stops: [
      { value: '0', color: '#001840', label: 'Calme' },
      { value: '0.25', color: '#003d7a', label: 'Ridée' },
      { value: '0.5', color: '#0066cc', label: 'Belle' },
      { value: '0.75', color: '#0099ff', label: '' },
      { value: '1.0', color: '#00ccff', label: 'Peu agitée' },
      { value: '1.25', color: '#66ffcc', label: '' },
      { value: '1.5', color: '#ffdd00', label: 'Agitée' },
      { value: '≥ 2.0', color: '#ff4400', label: 'Forte' },
    ],
    note: 'Hs max observé : 1.41 m (02/04/2026)',
  },
  {
    key: 'tp',
    shortName: 'Tp',
    fullName: 'Période de pic',
    unit: 's',
    description: 'Temps entre deux crêtes de la houle dominante. Plus Tp est élevé, plus la houle est longue et énergétique.',
    stops: [
      { value: '0–4', color: '#001840', label: 'Mer du vent' },
      { value: '4–6', color: '#003388', label: 'Courte' },
      { value: '6–8', color: '#0066cc', label: 'Mixte' },
      { value: '8–10', color: '#00aaff', label: 'Modérée' },
      { value: '10–12', color: '#44eebb', label: 'Longue' },
      { value: '12–15', color: '#aaff44', label: 'Océanique' },
      { value: '15–20', color: '#ffdd00', label: 'Tempête' },
      { value: '≥ 20', color: '#ff4400', label: 'Extrême' },
    ],
    note: 'Tp élevé = plus d’énergie même si Hs faible',
  },
  {
    key: 'dir',
    shortName: 'Dir',
    fullName: 'Direction des vagues',
    unit: '°',
    description: 'Direction d’où proviennent les vagues. 270° correspond à une houle venant de l’Ouest.',
    stops: [
      { value: 'N 0°', color: '#ff0000', label: 'Nord' },
      { value: 'E 90°', color: '#ffff00', label: 'Est' },
      { value: 'S 180°', color: '#0088ff', label: 'Sud' },
      { value: 'O 270°', color: '#8800ff', label: 'Ouest' },
      { value: 'N 360°', color: '#ff0000', label: 'Nord' },
    ],
    note: 'Direction dominante La Rochelle : 270°–315°',
  },
  {
    key: 'phs0',
    shortName: 'Phs0',
    fullName: 'Hs houle primaire',
    unit: 'm',
    description: 'Hauteur significative de la houle dominante. Elle représente la composante océanique principale.',
    stops: [
      { value: '0', color: '#001020', label: 'Nulle' },
      { value: '0.3', color: '#004488', label: 'Faible' },
      { value: '0.6', color: '#0077cc', label: 'Modérée' },
      { value: '0.9', color: '#00aaff', label: '' },
      { value: '1.2', color: '#44eebb', label: 'Forte' },
      { value: '≥ 1.5', color: '#ff8800', label: 'Très forte' },
    ],
    note: 'Combinée au total via √(Phs0² + Phs1² + Phs2²)',
  },
  {
    key: 'ptp0',
    shortName: 'Ptp0',
    fullName: 'Tp houle primaire',
    unit: 's',
    description: 'Période de pic de la houle primaire. Elle renseigne sur la longueur et l’énergie de la houle océanique.',
    stops: [
      { value: '0–5', color: '#001020', label: 'Très courte' },
      { value: '5–8', color: '#003366', label: 'Courte' },
      { value: '8–10', color: '#0066cc', label: 'Modérée' },
      { value: '10–12', color: '#00aaff', label: 'Longue' },
      { value: '12–15', color: '#44ddbb', label: 'Océanique' },
      { value: '15–18', color: '#aaff44', label: 'Tempête' },
      { value: '≥ 20', color: '#ff4400', label: 'Extrême' },
    ],
    note: 'Tp > 12 s = houle atlantique longue',
  },
]

const SEA_STATES = [
  { hs: '0 – 0.1 m', state: 'Calme', color: '#001840' },
  { hs: '0.1 – 0.5 m', state: 'Ridée', color: '#003d7a' },
  { hs: '0.5 – 1.25 m', state: 'Belle', color: '#0066cc' },
  { hs: '1.25 – 2.5 m', state: 'Peu agitée', color: '#00ccff' },
  { hs: '2.5 – 4 m', state: 'Agitée', color: '#ffdd00' },
  { hs: '> 4 m', state: 'Forte / Grosse', color: '#ff4400' },
]

interface Props {
  activeVar?: WW3VarKey
  visible?: boolean
}

export default function WW3Legend({ activeVar = 'hs', visible = true }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [selectedVar, setSelectedVar] = useState<WW3VarKey>(activeVar)
  const [showInfo, setShowInfo] = useState(false)

  useEffect(() => {
    setSelectedVar(activeVar)
  }, [activeVar])

  if (!visible) return null

  const legend = LEGENDS.find(l => l.key === selectedVar) ?? LEGENDS[0]

  return (
    <aside className={`ww3-legend ${expanded ? 'expanded' : ''}`} aria-label="Légende WW3">
      <div className="wl-header">
        <button
          className="wl-header-main"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          type="button"
        >
          <span className="wl-kicker">WW3</span>
          <span className="wl-title">Légende de simulation</span>
          <span className="wl-subtitle">{legend.fullName}</span>
        </button>

        <div className="wl-header-actions">
          <button
            className={`wl-info-btn ${showInfo ? 'active' : ''}`}
            onClick={() => setShowInfo(v => !v)}
            type="button"
            aria-pressed={showInfo}
          >
            i
          </button>
          <button
            className="wl-expand-btn"
            onClick={() => setExpanded(v => !v)}
            type="button"
            aria-label={expanded ? 'Réduire la légende' : 'Déployer la légende'}
          >
            {expanded ? '−' : '+'}
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="wl-info-panel">
          <div className="wl-info-title">Indicateurs</div>
          <div className="wl-info-grid">
            <div className="wl-info-row"><span>Hs</span><span>Hauteur significative</span></div>
            <div className="wl-info-row"><span>Tp</span><span>Période de pic</span></div>
            <div className="wl-info-row"><span>Dir</span><span>Direction des vagues</span></div>
            <div className="wl-info-row"><span>Phs0</span><span>Hs de la houle primaire</span></div>
            <div className="wl-info-row"><span>Ptp0</span><span>Tp de la houle primaire</span></div>
          </div>
          <div className="wl-info-formula">Hs total = √(Phs0² + Phs1² + Phs2²)</div>
        </div>
      )}

      <div className="wl-tabs" role="tablist" aria-label="Variables WW3">
        {LEGENDS.map(item => (
          <button
            key={item.key}
            className={`wl-tab ${selectedVar === item.key ? 'active' : ''}`}
            onClick={() => setSelectedVar(item.key)}
            type="button"
            role="tab"
            aria-selected={selectedVar === item.key}
          >
            {item.shortName}
          </button>
        ))}
      </div>

      <div className="wl-body">
        <div className="wl-meta">
          <div className="wl-meta-name">{legend.fullName}</div>
          <div className="wl-meta-unit">{legend.unit}</div>
        </div>

        <div className="wl-colorbar-wrap">
          <div
            className="wl-colorbar"
            style={{
              background: `linear-gradient(to right, ${legend.stops.map(s => s.color).join(', ')})`,
            }}
          />
          <div className="wl-colorbar-labels">
            {legend.stops.map((stop, i) => (
              <span
                key={i}
                className="wl-cb-label"
                style={{ left: `${(i / Math.max(legend.stops.length - 1, 1)) * 100}%` }}
              >
                {stop.value}
              </span>
            ))}
          </div>
        </div>

        {expanded && (
          <>
            <p className="wl-var-desc">{legend.description}</p>

            <div className="wl-stops">
              {legend.stops.map((stop, i) => (
                <div key={i} className="wl-stop-row">
                  <span className="wl-stop-swatch" style={{ background: stop.color }} />
                  <span className="wl-stop-value">{stop.value} {legend.unit}</span>
                  <span className="wl-stop-label">{stop.label || '—'}</span>
                </div>
              ))}
            </div>

            {legend.note && <div className="wl-note">{legend.note}</div>}

            {selectedVar === 'hs' && (
              <div className="wl-sea-states">
                <div className="wl-section-title">État de mer</div>
                {SEA_STATES.map((item, i) => (
                  <div key={i} className="wl-sea-row">
                    <span className="wl-sea-dot" style={{ background: item.color }} />
                    <span className="wl-sea-hs">{item.hs}</span>
                    <span className="wl-sea-state">{item.state}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedVar === 'dir' && (
              <div className="wl-compass">
                <div className="wl-section-title">Repère directionnel</div>
                <div className="wl-compass-ring">
                  {['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'].map((d, i) => (
                    <span
                      key={d}
                      className="wl-compass-point"
                      style={{ transform: `rotate(${i * 45}deg) translateY(-34px) rotate(-${i * 45}deg)` }}
                    >
                      {d}
                    </span>
                  ))}
                  <div className="wl-compass-center">Atlantique</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="wl-source">
        WAVEWATCH III · R1141 · Charentes 200 m · 02/04/2026
      </div>
    </aside>
  )
}