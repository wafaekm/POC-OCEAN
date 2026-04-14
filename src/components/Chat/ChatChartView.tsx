import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, RadialLinearScale, ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line, Bar, Radar, Pie, Doughnut, PolarArea } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, RadialLinearScale, ArcElement,
  Title, Tooltip, Legend, Filler,
)

interface Visual {
  labels: string[]
  values: number[]
  chart_type: string
  unit?: string
  station?: string
}

const PALETTE = [
  'rgba(34,211,238,0.8)', 'rgba(56,189,248,0.8)', 'rgba(99,102,241,0.8)',
  'rgba(20,184,166,0.8)', 'rgba(251,146,60,0.8)', 'rgba(244,63,94,0.8)',
  'rgba(168,85,247,0.8)', 'rgba(234,179,8,0.8)',
]

const tooltipBase = {
  backgroundColor: 'rgba(13,34,64,0.95)',
  titleColor: '#22d3ee',
  bodyColor: '#d8eef9',
  borderColor: 'rgba(34,211,238,0.3)',
  borderWidth: 1,
}

const axisStyle = {
  ticks: { color: '#67b8cc' as const, font: { size: 10 } },
  grid: { color: 'rgba(34,211,238,0.07)' },
  border: { color: 'rgba(34,211,238,0.15)' },
}

export default function ChatChartView({ visual }: { visual: Visual }) {
  const { labels, values, chart_type, unit = '', station = 'La Rochelle' } = visual

  const isRadial = ['pie', 'doughnut', 'polarArea'].includes(chart_type)
  const isRadar  = chart_type === 'radar'

  const title = isRadial ? `Répartition — ${station}` : station

  const radialData = {
    labels,
    datasets: [{
      label: unit,
      data: values,
      backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
      borderColor: 'rgba(4,13,31,0.6)',
      borderWidth: 1,
      hoverOffset: 6,
    }],
  }

  const linearData = {
    labels,
    datasets: [{
      label: unit,
      data: values,
      fill: chart_type === 'line',
      borderColor: '#22d3ee',
      backgroundColor: chart_type === 'bar' ? 'rgba(34,211,238,0.45)' : 'rgba(34,211,238,0.07)',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: chart_type === 'line' ? 2.5 : 0,
      pointBackgroundColor: '#22d3ee' as const,
    }],
  }

  const radarData = {
    labels,
    datasets: [{
      label: unit,
      data: values,
      fill: true,
      borderColor: '#22d3ee',
      backgroundColor: 'rgba(34,211,238,0.12)',
      borderWidth: 2,
      pointBackgroundColor: '#22d3ee' as const,
    }],
  }

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 600 },
    plugins: {
      legend: {
        display: isRadial || isRadar,
        labels: { color: '#94b4cc', font: { size: 11 }, boxWidth: 14 },
      },
      tooltip: {
        ...tooltipBase,
        callbacks: {
          label: (ctx: { label?: string; parsed: { y?: number; r?: number } | number }) =>
            isRadial
              ? ` ${(ctx as { label: string }).label}: ${ctx.parsed} ${unit}`
              : ` ${(ctx.parsed as { y?: number; r?: number }).y ?? ctx.parsed} ${unit}`,
        },
      },
    },
  }

  const linearOptions = {
    ...baseOptions,
    scales: {
      x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxTicksLimit: 10 } },
      y: {
        ...axisStyle,
        ticks: { ...axisStyle.ticks, callback: (v: number | string) => `${v} ${unit}` },
      },
    },
  }

  const radarOptions = {
    ...baseOptions,
    scales: {
      r: {
        ticks: { color: '#67b8cc', font: { size: 10 }, backdropColor: 'transparent' },
        grid: { color: 'rgba(34,211,238,0.15)' },
        pointLabels: { color: '#67b8cc', font: { size: 10 } },
      },
    },
  }

  return (
    <div style={{
      marginTop: 10, padding: '14px 16px 10px',
      background: 'rgba(7,22,48,0.6)',
      border: '1px solid rgba(34,211,238,0.18)',
      borderRadius: 10,
    }}>
      <p style={{ fontSize: '0.72rem', color: '#67b8cc', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
        {title}
      </p>
      {chart_type === 'line'       && <Line      data={linearData} options={linearOptions as never} />}
      {chart_type === 'bar'        && <Bar       data={linearData} options={linearOptions as never} />}
      {chart_type === 'radar'      && <Radar     data={radarData}  options={radarOptions as never} />}
      {chart_type === 'pie'        && <Pie       data={radialData} options={baseOptions as never} />}
      {chart_type === 'doughnut'   && <Doughnut  data={radialData} options={baseOptions as never} />}
      {chart_type === 'polarArea'  && <PolarArea data={radialData} options={baseOptions as never} />}
    </div>
  )
}
