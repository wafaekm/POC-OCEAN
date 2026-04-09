import { useState } from 'react'
import './WW3Legend.css'

// ─── TYPES ───────────────────────────────────────────────────────────────────
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

// ─── DONNÉES LÉGENDE ─────────────────────────────────────────────────────────
const LEGENDS: VarLegend[] = [
  {
    key: 'hs',
    shortName: 'Hs',
    fullName: 'Hauteur Significative',
    unit: 'm',
    description: 'Moyenne du tiers supérieur des vagues. Indicateur principal de l\'état de la mer.',
    stops: [
      { value: '0',     color: '#001840', label: 'Calme' },
      { value: '0.25',  color: '#003d7a', label: 'Ridée' },
      { value: '0.5',   color: '#0066cc', label: 'Belle' },
      { value: '0.75',  color: '#0099ff', label: '' },
      { value: '1.0',   color: '#00ccff', label: 'Peu agitée' },
      { value: '1.25',  color: '#66ffcc', label: '' },
      { value: '1.5',   color: '#ffdd00', label: 'Agitée' },
      { value: '≥ 2.0', color: '#ff4400', label: 'Forte' },
    ],
    note: 'Hs max observé : 1.41 m (02/04/2026)',
  },
  {
    key: 'tp',
    shortName: 'Tp',
    fullName: 'Période de Pic',
    unit: 's',
    description: 'Temps entre deux crêtes de la houle dominante. Plus Tp est élevé, plus la houle est longue et énergétique.',
    stops: [
      { value: '0–4',   color: '#001840', label: 'Mer du vent' },
      { value: '4–6',   color: '#003388', label: 'Courte' },
      { value: '6–8',   color: '#0066cc', label: 'Mixte' },
      { value: '8–10',  color: '#00aaff', label: 'Modérée' },
      { value: '10–12', color: '#44eebb', label: 'Longue' },
      { value: '12–15', color: '#aaff44', label: 'Océanique' },
      { value: '15–20', color: '#ffdd00', label: 'Tempête' },
      { value: '≥ 20',  color: '#ff4400', label: 'Extrême' },
    ],
    note: 'Tp élevé = plus d\'énergie même si Hs faible',
  },
  {
    key: 'dir',
    shortName: 'Dir',
    fullName: 'Direction des vagues',
    unit: '°',
    description: 'Direction d\'où proviennent les vagues (convention météo). 270° = vagues venant de l\'Ouest (Atlantique).',
    stops: [
      { value: 'N  0°',   color: '#ff0000', label: 'Nord' },
      { value: 'E  90°',  color: '#ffff00', label: 'Est' },
      { value: 'S 180°',  color: '#0088ff', label: 'Sud' },
      { value: 'O 270°',  color: '#8800ff', label: 'Ouest' },
      { value: 'N 360°',  color: '#ff0000', label: 'Nord' },
    ],
    note: 'Direction dominante La Rochelle : 270°–315° (Atlantique)',
  },
  {
    key: 'phs0',
    shortName: 'Phs0',
    fullName: 'Hs Houle Primaire',
    unit: 'm',
    description: 'Hauteur significative de la partition de houle dominante (swell 1). Représente la houle océanique venue de loin.',
    stops: [
      { value: '0',     color: '#001020', label: 'Nulle' },
      { value: '0.3',   color: '#004488', label: 'Faible' },
      { value: '0.6',   color: '#0077cc', label: 'Modérée' },
      { value: '0.9',   color: '#00aaff', label: '' },
      { value: '1.2',   color: '#44eebb', label: 'Forte' },
      { value: '≥ 1.5', color: '#ff8800', label: 'Très forte' },
    ],
    note: 'Combiné à Hs total via √(Phs0² + Phs1² + Phs2²)',
  },
  {
    key: 'ptp0',
    shortName: 'Ptp0',
    fullName: 'Tp Houle Primaire',
    unit: 's',
    description: 'Période de pic de la houle primaire. Indique si la houle océanique est longue (énergie haute) ou courte.',
    stops: [
      { value: '0–5',   color: '#001020', label: 'Très courte' },
      { value: '5–8',   color: '#003366', label: 'Courte' },
      { value: '8–10',  color: '#0066cc', label: 'Modérée' },
      { value: '10–12', color: '#00aaff', label: 'Longue' },
      { value: '12–15', color: '#44ddbb', label: 'Océanique' },
      { value: '15–18', color: '#aaff44', label: 'Tempête' },
      { value: '≥ 20',  color: '#ff4400', label: 'Extrême' },
    ],
    note: 'Tp houle > 12s = houle atlantique de longue période',
  },
]

// ─── SEA STATE TABLE (Hs) ─────────────────────────────────────────────────────
const SEA_STATES = [
  { hs: '0 – 0.1m',    state: 'Calme',         color: '#001840' },
  { hs: '0.1 – 0.5m',  state: 'Ridée',          color: '#003d7a' },
  { hs: '0.5 – 1.25m', state: 'Belle',           color: '#0066cc' },
  { hs: '1.25 – 2.5m', state: 'Peu agitée',      color: '#00ccff' },
  { hs: '2.5 – 4m',    state: 'Agitée',          color: '#ffdd00' },
  { hs: '> 4m',        state: 'Forte / Grosse',  color: '#ff4400' },
]

// ─── COMPOSANT ───────────────────────────────────────────────────────────────
interface Props {
  activeVar?: WW3VarKey
  visible?: boolean
}

export default function WW3Legend({ activeVar = 'hs', visible = true }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [selectedVar, setSelectedVar] = useState<WW3VarKey>(activeVar)
  const [showInfo, setShowInfo] = useState(false)

  const legend = LEGENDS.find(l => l.key === selectedVar) ?? LEGENDS[0]

  if (!visible) return null

  return (
    <div className={`ww3-legend ${expanded ? 'expanded' : ''}`}>
      {/* ── Header ── */}
      <div className="wl-header" onClick={() => setExpanded(p => !p)}>
        <div className="wl-header-left">
          <div className="wl-dot" />
          <span className="wl-title">WW3 — Légende</span>
        </div>
        <div className="wl-header-right">
          <button
            className="wl-info-btn"
            onClick={e => { e.stopPropagation(); setShowInfo(p => !p) }}
            title="Aide sur les indicateurs"
          >
            ?
          </button>
          <span className="wl-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* ── Info panel ── */}
      {showInfo && (
        <div className="wl-info-panel">
          <div className="wl-info-title">Indicateurs WW3</div>
          <div className="wl-info-row">
            <span className="wl-info-key">Hs</span>
            <span>Hauteur significative — état de la mer</span>
          </div>
          <div className="wl-info-row">
            <span className="wl-info-key">Tp</span>
            <span>Période de pic — longueur de la houle</span>
          </div>
          <div className="wl-info-row">
            <span className="wl-info-key">Dir</span>
            <span>Direction d'où viennent les vagues</span>
          </div>
          <div className="wl-info-row">
            <span className="wl-info-key">Phs0</span>
            <span>Hs de la houle primaire (swell 1)</span>
          </div>
          <div className="wl-info-row">
            <span className="wl-info-key">Ptp0</span>
            <span>Tp de la houle primaire</span>
          </div>
          <div className="wl-info-formula">
            Hs total = √(Phs0² + Phs1² + Phs2²)
          </div>
        </div>
      )}

      {/* ── Variable tabs ── */}
      <div className="wl-tabs">
        {LEGENDS.map(l => (
          <button
            key={l.key}
            className={`wl-tab ${selectedVar === l.key ? 'active' : ''}`}
            onClick={() => setSelectedVar(l.key)}
          >
            {l.shortName}
          </button>
        ))}
      </div>

      {/* ── Gradient colorbar ── */}
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
              style={{ left: `${(i / (legend.stops.length - 1)) * 100}%` }}
            >
              {stop.value}
            </span>
          ))}
        </div>
      </div>

      {/* ── Stops list (expanded only) ── */}
      {expanded && (
        <>
          <div className="wl-var-desc">{legend.description}</div>

          <div className="wl-stops">
            {legend.stops.map((stop, i) => (
              <div key={i} className="wl-stop-row">
                <span className="wl-stop-swatch" style={{ background: stop.color }} />
                <span className="wl-stop-value">{stop.value} {legend.unit}</span>
                {stop.label && <span className="wl-stop-label">{stop.label}</span>}
              </div>
            ))}
          </div>

          {legend.note && (
            <div className="wl-note">ℹ {legend.note}</div>
          )}

          {/* État de la mer (seulement pour Hs) */}
          {selectedVar === 'hs' && (
            <div className="wl-sea-states">
              <div className="wl-sea-title">Échelle état de mer</div>
              {SEA_STATES.map((s, i) => (
                <div key={i} className="wl-sea-row">
                  <span className="wl-sea-dot" style={{ background: s.color }} />
                  <span className="wl-sea-hs">{s.hs}</span>
                  <span className="wl-sea-state">{s.state}</span>
                </div>
              ))}
            </div>
          )}

          {/* Direction rose (seulement pour Dir) */}
          {selectedVar === 'dir' && (
            <div className="wl-compass">
              <div className="wl-compass-ring">
                {['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'].map((d, i) => (
                  <span
                    key={d}
                    className="wl-compass-point"
                    style={{ transform: `rotate(${i * 45}deg) translateY(-28px) rotate(-${i * 45}deg)` }}
                  >
                    {d}
                  </span>
                ))}
                <div className="wl-compass-center">→ Atlantique</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Source ── */}
      <div className="wl-source">
        Source : WAVEWATCH III · R1141 · Charentes 200m · 02/04/2026
      </div>
    </div>
  )
}