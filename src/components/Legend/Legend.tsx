import './Legend.css'

const ITEMS = [
  { color: '#E24B4A', label: 'Submersion forte' },
  { color: '#EF9F27', label: 'Submersion modérée' },
  { color: '#378ADD', label: 'Zone littorale' },
]

export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Risque submersion</div>
      {ITEMS.map(({ color, label }) => (
        <div key={label} className="legend-row">
          <span className="legend-swatch" style={{ background: color }} />
          <span>{label}</span>
        </div>
      ))}
      <div className="legend-source">Source : SHOM / Géorisques</div>
    </div>
  )
}