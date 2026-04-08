import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import { definePreset } from '@primevue/themes'
import 'primeicons/primeicons.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Chart, registerables } from 'chart.js'
import App from './App.vue'

Chart.register(...registerables)

const OceanPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50:  '{cyan.50}',
      100: '{cyan.100}',
      200: '{cyan.200}',
      300: '{cyan.300}',
      400: '{cyan.400}',
      500: '{cyan.500}',
      600: '{cyan.600}',
      700: '{cyan.700}',
      800: '{cyan.800}',
      900: '{cyan.900}',
      950: '{cyan.950}',
    },
  },
})

const app = createApp(App)

app.use(PrimeVue, {
  theme: {
    preset: OceanPreset,
    options: {
      darkModeSelector: ':root',
    },
  },
})

app.mount('#app')
