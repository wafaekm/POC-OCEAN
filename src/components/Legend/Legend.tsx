import './Legend.css'

const ITEMS = [
  { color: '#1a6bbd', label: 'Zones inondées (scénario)', opacity: 0.65 },
  { color: '#E24B4A', label: 'Zones PPRI officielles', dashed: true },
  { color: '#3498DB', label: 'Réseau eau', dot: true },
  { color: '#E74C3C', label: 'Secours / Santé', dot: true },
]

export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Légende</div>
      {ITEMS.map(({ color, label, opacity, dashed, dot }) => (
        <div key={label} className="legend-row">
          {dot ? (
            <span className="legend-dot" style={{ background: color }} />
          ) : dashed ? (
            <span className="legend-dashed" style={{ borderColor: color }} />
          ) : (
            <span
              className="legend-swatch"
              style={{ background: color, opacity: opacity ?? 1 }}
            />
          )}
          <span className="legend-label">{label}</span>
        </div>
      ))}
      <div className="legend-source">Source : IGN / SHOM / OSM</div>
    </div>
  )
}