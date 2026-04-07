export interface FloodFrame {
  time: number
  avgDepth: number
  waterSurface: number
  floodedCells: number
  geojsonPath: string
}

export async function loadFloodFrames(): Promise<FloodFrame[]> {
  const files = [
    'frame_02_t0.22.geojson',
    'frame_03_t0.33.geojson',
    'frame_04_t0.44.geojson',
    'frame_05_t0.56.geojson',
    'frame_06_t0.67.geojson',
    'frame_07_t0.78.geojson',
    'frame_08_t0.89.geojson',
    'frame_09_t1.00.geojson',
  ]

  const frames: FloodFrame[] = []

  for (const file of files) {
    const res = await fetch(`/data/flood_animation/${file}`)
    const geojson = await res.json()
    const props = geojson.features[0]?.properties
    frames.push({
      time: props.time,
      avgDepth: props.avg_depth,
      waterSurface: props.water_surface,
      floodedCells: props.flooded_cells,
      geojsonPath: `/data/flood_animation/${file}`,
    })
  }

  return frames
}