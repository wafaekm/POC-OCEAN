import './ViewToggle.css'

type View = '2d' | '3d'

interface Props {
  current: View
  onChange: (v: View) => void
}

export default function ViewToggle({ current, onChange }: Props) {
  return (
    <div className="view-toggle">
      <button
        className={current === '2d' ? 'active' : ''}
        onClick={() => onChange('2d')}
      >
        2D
      </button>
      <button
        className={current === '3d' ? 'active' : ''}
        onClick={() => onChange('3d')}
      >
        3D
      </button>
    </div>
  )
}