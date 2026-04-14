<template>
  <div class="chart-outer">
    <p class="chart-title">{{ title }}</p>
    <div class="chart-wrap">
      <Chart :type="visual.chart_type" :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Chart from 'primevue/chart'

const props = defineProps({
  visual: { type: Object, required: true },
})

const unit = computed(() => props.visual.unit || 'mm')

const isRadial = computed(() =>
  ['pie', 'doughnut', 'polarArea'].includes(props.visual.chart_type)
)
const isRadar = computed(() => props.visual.chart_type === 'radar')

const title = computed(() => {
  const station = props.visual.station || 'La Rochelle'
  if (isRadial.value) return `Répartition — ${station}`
  if (isRadar.value)  return `Profil radial — ${station}`
  return station
})

const PALETTE = [
  'rgba(34, 211, 238, 0.8)',
  'rgba(56, 189, 248, 0.8)',
  'rgba(99, 102, 241, 0.8)',
  'rgba(20, 184, 166, 0.8)',
  'rgba(251, 146, 60, 0.8)',
  'rgba(244, 63, 94, 0.8)',
  'rgba(168, 85, 247, 0.8)',
  'rgba(234, 179, 8, 0.8)',
]

const chartData = computed(() => {
  if (isRadial.value) {
    return {
      labels: props.visual.labels,
      datasets: [{
        label: unit.value,
        data: props.visual.values,
        backgroundColor: props.visual.labels.map((_, i) => PALETTE[i % PALETTE.length]),
        borderColor: 'rgba(4, 13, 31, 0.6)',
        borderWidth: 1,
        hoverOffset: 6,
      }],
    }
  }
  if (isRadar.value) {
    return {
      labels: props.visual.labels,
      datasets: [{
        label: unit.value,
        data: props.visual.values,
        fill: true,
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34, 211, 238, 0.12)',
        borderWidth: 2,
        pointBackgroundColor: '#22d3ee',
        pointBorderColor: 'transparent',
        pointRadius: 3,
      }],
    }
  }
  // line / bar / default
  return {
    labels: props.visual.labels,
    datasets: [{
      label: unit.value,
      data: props.visual.values,
      fill: props.visual.chart_type === 'line',
      borderColor: '#22d3ee',
      backgroundColor: props.visual.chart_type === 'bar'
        ? 'rgba(34, 211, 238, 0.45)'
        : 'rgba(34, 211, 238, 0.07)',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: props.visual.chart_type === 'line' ? 2.5 : 0,
      pointBackgroundColor: '#22d3ee',
      pointBorderColor: 'transparent',
    }],
  }
})

const tooltipBase = {
  backgroundColor: 'rgba(13, 34, 64, 0.95)',
  titleColor: '#22d3ee',
  bodyColor: '#d8eef9',
  borderColor: 'rgba(34, 211, 238, 0.3)',
  borderWidth: 1,
}

const axisStyle = {
  ticks: { color: '#67b8cc', font: { size: 10 } },
  grid: { color: 'rgba(34, 211, 238, 0.07)' },
  border: { color: 'rgba(34, 211, 238, 0.15)' },
}

const chartOptions = computed(() => {
  const base = {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 600 },
    plugins: {
      legend: {
        display: isRadial.value || isRadar.value,
        labels: { color: '#94b4cc', font: { size: 11 }, boxWidth: 14 },
      },
      tooltip: {
        ...tooltipBase,
        callbacks: {
          label: (ctx) => isRadial.value
            ? ` ${ctx.label}: ${ctx.parsed} ${unit.value}`
            : ` ${ctx.parsed.y ?? ctx.parsed.r ?? ctx.parsed} ${unit.value}`,
        },
      },
    },
  }

  if (isRadial.value) return base

  if (isRadar.value) {
    return {
      ...base,
      scales: {
        r: {
          ticks: { color: '#67b8cc', font: { size: 10 }, backdropColor: 'transparent' },
          grid: { color: 'rgba(34, 211, 238, 0.15)' },
          pointLabels: { color: '#67b8cc', font: { size: 10 } },
        },
      },
    }
  }

  return {
    ...base,
    scales: {
      x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxTicksLimit: 10 } },
      y: {
        ...axisStyle,
        ticks: { ...axisStyle.ticks, callback: (v) => `${v} ${unit.value}` },
      },
    },
  }
})
</script>

<style scoped>
.chart-outer {
  margin-top: 10px;
  padding: 14px 16px 10px;
  background: rgba(7, 22, 48, 0.6);
  border: 1px solid rgba(34, 211, 238, 0.18);
  border-radius: 10px;
}

.chart-title {
  font-size: 0.72rem;
  color: #67b8cc;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.chart-wrap {
  width: 100%;
}
</style>
