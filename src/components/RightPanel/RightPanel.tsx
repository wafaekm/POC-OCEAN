import type { LayerId } from '../../types/layers.types'
import './RightPanel.css'

/* ── Types ── */
interface Scenario {
  id: string
  label: string
  niveau_m: number
}

interface Impact {
  niveau_m: number
  batiments_touches: number
  routes_coupees: number
  reseaux_critiques: string[]
  surface_inondee_ha: number
}

type WW3VarKey = 'hs' | 'tp' | 'dir' | 'phs0' | 'ptp0'

interface WW3Frame {
  ts: string
  n_active: number
  hs_max: number
  hs_mean: number
}

const VAR_LABELS: Record<WW3VarKey, string> = {
  hs: 'Hs', tp: 'Tp', dir: 'Dir', phs0: 'Phs0', ptp0: 'Ptp0',
}

const N_FRAMES_TOTAL = 14 // valeur exemple

interface Props {
  /* Scénarios */
  scenarios: Scenario[]
  activeScenario: string | null
  impact: Impact | null
  onLoadScenario: (id: string) => void
  onClearScenario: () => void

  /* WW3 */
  ww3Active: boolean
  ww3Loading: boolean
  ww3Frame: number
  ww3Var: WW3VarKey
  ww3Playing: boolean
  ww3Arrows: boolean
  currentFrame: WW3Frame | null
  nFrames: number
  onToggleWW3: () => void
  onChangeWW3Var: (k: WW3VarKey) => void
  onToggleWW3Play: () => void
  onStepWW3: (delta: number) => void
  onToggleWW3Arrows: () => void
}

export default function RightPanel({
  scenarios,
  activeScenario,
  impact,
  onLoadScenario,
  onClearScenario,
  ww3Active,
  ww3Loading,
  ww3Frame,
  ww3Var,
  ww3Playing,
  ww3Arrows,
  currentFrame,
  nFrames,
  onToggleWW3,
  onChangeWW3Var,
  onToggleWW3Play,
  onStepWW3,
  onToggleWW3Arrows,
}: Props) {
  return (
    <aside className="right-panel" aria-label="Contrôles et résultats">

      {/* ── Scénarios de submersion ── */}
      <div className="rpanel-block">
        <div className="rpanel-label">Scénarios de submersion</div>
        <div className="scenario-list">
          {scenarios.map(s => (
            <button
              key={s.id}
              className={`scenario-item ${activeScenario === s.id ? 'active' : ''}`}
              onClick={() => activeScenario === s.id ? onClearScenario() : onLoadScenario(s.id)}
            >
              <span className="scenario-name">{s.label}</span>
              <span className="scenario-badge">+{s.niveau_m}m</span>
            </button>
          ))}
        </div>
        {activeScenario && (
          <button className="reset-btn fade-in" onClick={onClearScenario}>
            ↺ Réinitialiser
          </button>
        )}
      </div>

      {/* ── Impact estimé ── */}
      {impact && activeScenario && (
        <div className="rpanel-block fade-in">
          <div className="rpanel-label">
            Impact estimé
            <span className="label-tag">S{scenarios.findIndex(s => s.id === activeScenario) + 1}</span>
          </div>
          <div className="impact-grid">
            <ImpactRow label="Niveau d'eau"     value={`${impact.niveau_m}m NGF`} />
            <ImpactRow label="Bâtiments touchés" value={impact.batiments_touches.toLocaleString('fr-FR')} variant="danger" />
            <ImpactRow label="Routes coupées"    value={impact.routes_coupees.toLocaleString('fr-FR')} variant="warning" />
            <ImpactRow label="Surface inondée"   value={`${(impact.surface_inondee_ha / 100).toFixed(0)} km²`} />
            <ImpactRow
              label="Réseaux critiques"
              value={impact.reseaux_critiques.length > 0 ? impact.reseaux_critiques.join(', ') : 'Aucun'}
              variant={impact.reseaux_critiques.length > 0 ? 'danger' : undefined}
            />
          </div>
        </div>
      )}

      {/* ── Simulation WW3 ── */}
      <div className="rpanel-block">
        <div className="rpanel-header">
          <div className="rpanel-label" style={{ margin: 0 }}>Simulation WW3</div>
          <OnOffButton
            active={ww3Active}
            loading={ww3Loading}
            onClick={onToggleWW3}
          />
        </div>

        {ww3Active && currentFrame && (
          <div className="ww3-body fade-in">
            {/* Stats */}
            <div className="ww3-stats">
              <StatBox label="Hs max"    value={`${currentFrame.hs_max.toFixed(2)} m`} accent />
              <StatBox label="Hs moy"    value={`${currentFrame.hs_mean.toFixed(2)} m`} />
              <StatBox label="Points"    value={currentFrame.n_active.toLocaleString()} />
              <StatBox label="Heure"     value={currentFrame.ts.slice(11, 16)} />
            </div>

            {/* Variable selector */}
            <div className="ww3-var-label">Variable</div>
            <div className="ww3-var-row">
              {(Object.keys(VAR_LABELS) as WW3VarKey[]).map(k => (
                <button
                  key={k}
                  className={`var-chip ${ww3Var === k ? 'active' : ''}`}
                  onClick={() => onChangeWW3Var(k)}
                >
                  {VAR_LABELS[k]}
                </button>
              ))}
            </div>

            {/* Flèches */}
            <div className="ww3-option">
              <span className="ww3-option-label">Flèches direction</span>
              <button
                className={`chip-toggle ${ww3Arrows ? 'active' : ''}`}
                onClick={onToggleWW3Arrows}
              >
                {ww3Arrows ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Timeline */}
            <div className="ww3-timeline">
              <div className="timeline-ts">{currentFrame.ts}</div>
              <div className="timeline-bar">
                <div
                  className="timeline-fill"
                  style={{ width: nFrames > 0 ? `${((ww3Frame + 1) / nFrames) * 100}%` : '0%' }}
                />
              </div>
              <div className="timeline-controls">
                <button className="ctrl-btn" onClick={() => onStepWW3(-1)} aria-label="Frame précédente">◀</button>
                <button
                  className={`ctrl-btn play ${ww3Playing ? 'active' : ''}`}
                  onClick={onToggleWW3Play}
                  aria-label={ww3Playing ? 'Pause' : 'Lecture'}
                >
                  {ww3Playing ? '⏸' : '▶'}
                </button>
                <button className="ctrl-btn" onClick={() => onStepWW3(1)} aria-label="Frame suivante">▶</button>
                <span className="frame-count">{ww3Frame + 1} / {nFrames}</span>
              </div>
            </div>
          </div>
        )}

        {ww3Loading && (
          <div className="ww3-loading">Chargement données WW3…</div>
        )}
      </div>

      {/* ── Légende ── */}
      <div className="rpanel-block rpanel-legend">
        <div className="rpanel-label">Légende</div>
        <div className="legend-items">
          <LegendItem type="fill"   color="#378ADD" opacity={0.55} label="Submersion simulée" />
          <LegendItem type="dashed" color="#E24B4A" label="Périmètre PPRI" />
          <LegendItem type="dot"    color="#3498DB" label="Réseau eau" />
          <LegendItem type="dot"    color="#E74C3C" label="Secours / Santé" />
        </div>
        <div className="legend-source">Source : IGN · SHOM · OSM</div>
      </div>

    </aside>
  )
}

/* ── Sous-composants ── */

function ImpactRow({ label, value, variant }: { label: string; value: string; variant?: 'danger' | 'warning' }) {
  return (
    <div className="impact-row">
      <span className="impact-label">{label}</span>
      <span className={`impact-value ${variant ? `impact-${variant}` : ''}`}>{value}</span>
    </div>
  )
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat-box">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${accent ? 'stat-accent' : ''}`}>{value}</span>
    </div>
  )
}

function OnOffButton({ active, loading, onClick }: { active: boolean; loading: boolean; onClick: () => void }) {
  return (
    <button
      className={`onoff-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      disabled={loading}
      aria-pressed={active}
    >
      {loading ? '…' : active ? 'ON' : 'OFF'}
    </button>
  )
}

function LegendItem({ type, color, opacity, label }: {
  type: 'fill' | 'dashed' | 'dot'
  color: string
  opacity?: number
  label: string
}) {
  return (
    <div className="legend-row">
      {type === 'fill' && (
        <span className="legend-swatch" style={{ background: color, opacity: opacity ?? 1 }} />
      )}
      {type === 'dashed' && (
        <span className="legend-dashed" style={{ borderColor: color }} />
      )}
      {type === 'dot' && (
        <span className="legend-dot" style={{ background: color }} />
      )}
      <span className="legend-label">{label}</span>
    </div>
  )
}
