import type { LayerId } from '../../types/layers.types'
import './LayerControl.css'

const LAYER_LABELS: Record<LayerId, string> = {
  'shom-bathymetrie': 'Bathymétrie GEBCO',
  'ppri-fill': 'Zones inondables',
  'ppri-zones': 'Contours PPRI',
}

interface Props {
  layers: Record<LayerId, boolean>
  onToggle: (id: LayerId) => void
}

export default function LayerControl({ layers, onToggle }: Props) {
  return (
    <div className="layer-control">
      <div className="layer-control-title">Couches</div>
      {(Object.keys(layers) as LayerId[]).map(id => (
        <label key={id} className="layer-row">
          <input
            type="checkbox"
            checked={layers[id]}
            onChange={() => onToggle(id)}
          />
          <span>{LAYER_LABELS[id]}</span>
        </label>
      ))}
    </div>
  )
}