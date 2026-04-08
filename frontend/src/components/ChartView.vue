<template>
  <div class="chart-outer">
    <p class="chart-title">
      Évolution du niveau marin — {{ visual.station }}
    </p>
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

const chartData = computed(() => ({
  labels: props.visual.labels,
  datasets: [
    {
      label: `Anomalie (${unit.value})`,
      data: props.visual.values,
      fill: true,
      borderColor: '#22d3ee',
      backgroundColor: 'rgba(34, 211, 238, 0.07)',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 2.5,
      pointBackgroundColor: '#22d3ee',
      pointBorderColor: 'transparent',
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 600 },
  plugins: {
    legend: {
      labels: { color: '#94b4cc', font: { size: 11 }, boxWidth: 14 },
    },
    tooltip: {
      backgroundColor: 'rgba(13, 34, 64, 0.95)',
      titleColor: '#22d3ee',
      bodyColor: '#d8eef9',
      borderColor: 'rgba(34, 211, 238, 0.3)',
      borderWidth: 1,
      callbacks: {
        label: (ctx) => ` ${ctx.parsed.y} ${unit.value}`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: '#67b8cc', maxTicksLimit: 10, font: { size: 10 } },
      grid: { color: 'rgba(34, 211, 238, 0.07)' },
      border: { color: 'rgba(34, 211, 238, 0.15)' },
    },
    y: {
      ticks: {
        color: '#67b8cc',
        font: { size: 10 },
        callback: (v) => `${v} ${unit.value}`,
      },
      grid: { color: 'rgba(34, 211, 238, 0.07)' },
      border: { color: 'rgba(34, 211, 238, 0.15)' },
    },
  },
}))
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
  height: 240px;
}
</style>
