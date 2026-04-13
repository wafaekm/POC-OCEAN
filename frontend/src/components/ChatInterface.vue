<template>
  <div class="chat-shell">

    <!-- Header -->
    <header class="chat-header">
      <div class="header-brand">
        <span class="header-icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- antenne -->
            <line x1="14" y1="2" x2="14" y2="5.5" stroke="#22d3ee" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="14" cy="1.8" r="1.2" fill="#22d3ee"/>
            <!-- tête robot -->
            <rect x="7" y="6" width="14" height="10" rx="3" stroke="#22d3ee" stroke-width="1.8" fill="rgba(34,211,238,0.08)"/>
            <!-- yeux -->
            <circle cx="11" cy="11" r="1.7" fill="#22d3ee"/>
            <circle cx="17" cy="11" r="1.7" fill="#22d3ee"/>
            <circle cx="11.6" cy="10.4" r="0.6" fill="#040d1f"/>
            <circle cx="17.6" cy="10.4" r="0.6" fill="#040d1f"/>
            <!-- vagues océan en bas -->
            <path d="M3 21c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0 3.5 2 5.5 0" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round" fill="none"/>
            <path d="M3 25c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0 3.5 2 5.5 0" stroke="#22d3ee" stroke-width="1.1" stroke-linecap="round" opacity=".4" fill="none"/>
          </svg>
        </span>
        <div>
          <h1 class="header-title">Géo-Twin Littoral</h1>
          <p class="header-subtitle">Assistant submersion marine - La Rochelle</p>
        </div>
      </div>
      <div class="header-status">
        <span class="status-dot"></span>
        <span class="status-label"></span>
      </div>
    </header>

    <!-- Messages -->
    <main class="messages-area" ref="scrollContainer">

      <!-- Écran de bienvenue (conversation vierge) -->
      <div v-if="isWelcomeScreen" class="welcome-screen">
        <div class="welcome-icon">
          <svg width="48" height="48" viewBox="0 0 28 28" fill="none">
            <line x1="14" y1="2" x2="14" y2="5.5" stroke="#22d3ee" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="14" cy="1.8" r="1.2" fill="#22d3ee"/>
            <rect x="7" y="6" width="14" height="10" rx="3" stroke="#22d3ee" stroke-width="1.8" fill="rgba(34,211,238,0.08)"/>
            <circle cx="11" cy="11" r="1.7" fill="#22d3ee"/>
            <circle cx="17" cy="11" r="1.7" fill="#22d3ee"/>
            <circle cx="11.6" cy="10.4" r="0.6" fill="#040d1f"/>
            <circle cx="17.6" cy="10.4" r="0.6" fill="#040d1f"/>
            <path d="M3 21c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0 3.5 2 5.5 0" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round" fill="none"/>
            <path d="M3 25c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0 3.5 2 5.5 0" stroke="#22d3ee" stroke-width="1.1" stroke-linecap="round" opacity=".4" fill="none"/>
          </svg>
        </div>
        <h2 class="welcome-title">Comment puis-je vous aider ?</h2>
        <p class="welcome-sub">Posez une question sur la marée, les risques côtiers ou le niveau marin</p>
        <div class="welcome-chips">
          <button
            v-for="s in DEFAULT_SUGGESTIONS"
            :key="s"
            class="chip chip--welcome"
            @click="sendSuggestion(s)"
          >{{ s }}</button>
        </div>
      </div>

      <!-- Messages normaux -->
      <div v-else class="messages-inner">
        <MessageBubble
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
        />
      </div>

      <div ref="messagesEnd" />
    </main>

    <!-- Input -->
    <footer class="input-area">

      <!-- Suggestions contextuelles -->
      <div v-if="!isWelcomeScreen && currentSuggestions.length && !isLoading" class="suggestions-bar">
        <button
          v-for="s in currentSuggestions"
          :key="s"
          class="chip chip--inline"
          @click="sendSuggestion(s)"
        >{{ s }}</button>
      </div>

      <div class="input-wrapper">
        <InputText
          ref="inputRef"
          v-model="inputText"
          placeholder="Posez votre question sur la marée, les risques côtiers…"
          class="message-input"
          :disabled="isLoading"
          @keydown="onKeydown"
          autocomplete="off"
        />
        <Button
          class="send-button"
          :disabled="!inputText.trim() || isLoading"
          @click="sendMessage"
          aria-label="Envoyer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </Button>
      </div>
      <p class="input-hint">Entrée pour envoyer · Shift+Entrée pour nouvelle ligne</p>
    </footer>

  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import MessageBubble from './MessageBubble.vue'

const BACKEND_URL = 'http://localhost:8000'

const TOOL_LABELS = {
  get_maree_actuelle:     'marée actuelle',
  get_maree_pour_date:    'données marée',
  get_current_datetime:   'date et heure',
  get_flood_scenarios:    'scénarios de submersion',
  get_flood_zones:        'zones PPRI',
  get_critical_networks:  'infrastructures critiques',
  get_xynthia_simulation: 'simulation Xynthia',
}

const DEFAULT_SUGGESTIONS = [
  "Quelle est la marée actuelle ?",
  "Scénarios de submersion",
  "Zones à risque PPRI",
  "Infrastructures critiques",
  "Simulation Xynthia",
]

const messages = ref([
  {
    id: 0,
    role: 'agent',
    type: 'text',
    content:
      "Bonjour ! Je suis votre assistant expert en submersion marine pour La Rochelle. " +
      "Je peux vous renseigner sur la hauteur de marée actuelle, les prédictions SHOM, " +
      "et les risques de submersion côtière. Comment puis-je vous aider ?",
  },
])

const inputText        = ref('')
const isLoading        = ref(false)
const currentSuggestions = ref([])
const scrollContainer  = ref(null)
const messagesEnd      = ref(null)
const inputRef         = ref(null)

let nextId = 1

// Affiche l'écran de bienvenue tant que seul le message d'accueil est présent
const isWelcomeScreen = computed(() => messages.value.length === 1)

function scrollToBottom() {
  nextTick(() => {
    messagesEnd.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function setStatus(id, text) {
  const idx = messages.value.findIndex(m => m.id === id)
  if (idx !== -1 && messages.value[idx].loading) {
    messages.value[idx].statusText = text
  }
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isLoading.value) return

  messages.value.push({ id: nextId++, role: 'user', type: 'text', content: text })
  inputText.value = ''
  isLoading.value = true
  currentSuggestions.value = []

  const loadingId = nextId++
  messages.value.push({ id: loadingId, role: 'agent', type: 'text', content: '', loading: true, statusText: 'Connexion…' })
  scrollToBottom()

  try {
    const res = await fetch(`${BACKEND_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: [] }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        let event
        try { event = JSON.parse(line.slice(6)) } catch { continue }

        if (event.type === 'done') {
          const data = event.result
          const idx = messages.value.findIndex(m => m.id === loadingId)
          if (idx !== -1) {
            messages.value[idx] = {
              id: loadingId,
              role: 'agent',
              type: data.type ?? 'text',
              content: data.text,
              visual: data.visual ?? null,
            }
          }
          currentSuggestions.value = data.suggestions ?? []
          scrollToBottom()
        } else if (event.type === 'thinking') {
          setStatus(loadingId, 'Interrogation de Mistral…')
        } else if (event.type === 'tool_call') {
          const label = TOOL_LABELS[event.message] ?? event.message
          setStatus(loadingId, `Outil : ${label}…`)
        } else if (event.type === 'tool_result') {
          const label = TOOL_LABELS[event.message] ?? event.message
          setStatus(loadingId, `${label} ✓`)
        } else if (event.type === 'retry') {
          setStatus(loadingId, event.message)
        } else if (event.type === 'error') {
          const idx = messages.value.findIndex(m => m.id === loadingId)
          if (idx !== -1) {
            messages.value[idx] = {
              id: loadingId, role: 'agent', type: 'text',
              content: "Une erreur est survenue. Veuillez réessayer.",
            }
          }
        }
      }
    }
  } catch {
    const idx = messages.value.findIndex(m => m.id === loadingId)
    if (idx !== -1) {
      messages.value[idx] = {
        id: loadingId, role: 'agent', type: 'text',
        content: "Impossible de joindre le serveur. Vérifiez que le backend est démarré sur le port 8000.",
      }
    }
  } finally {
    isLoading.value = false
    scrollToBottom()
    nextTick(() => inputRef.value?.$el?.focus())
  }
}

function sendSuggestion(text) {
  inputText.value = text
  sendMessage()
}

function onKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

onMounted(() => {
  scrollToBottom()
  nextTick(() => inputRef.value?.$el?.focus())
})
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────── */
.chat-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: radial-gradient(ellipse at 50% 0%, #071e3d 0%, #040d1f 70%);
  position: relative;
}

/* ── Header ─────────────────────────────────────────────── */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: rgba(7, 22, 48, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(34, 211, 238, 0.18);
  flex-shrink: 0;
  z-index: 10;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.3);
  flex-shrink: 0;
}

.header-title {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #e2f0fb;
  line-height: 1.2;
}

.header-subtitle {
  font-size: 0.75rem;
  color: #67b8cc;
  letter-spacing: 0.03em;
  margin-top: 1px;
}

.header-status {
  display: flex;
  align-items: center;
  gap: 7px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 8px #22d3ee;
  animation: pulse-dot 2.4s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px #22d3ee; }
  50%       { opacity: 0.5; box-shadow: 0 0 4px #22d3ee; }
}

.status-label {
  font-size: 0.72rem;
  color: #67b8cc;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* ── Messages area ───────────────────────────────────────── */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0 8px;
  scroll-behavior: smooth;
}

.messages-inner {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 20px;
}

/* ── Welcome screen ──────────────────────────────────────── */
.welcome-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px 24px;
  text-align: center;
  gap: 16px;
}

.welcome-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: rgba(34, 211, 238, 0.08);
  border: 1px solid rgba(34, 211, 238, 0.2);
  margin-bottom: 4px;
}

.welcome-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: #e2f0fb;
  letter-spacing: 0.01em;
}

.welcome-sub {
  font-size: 0.85rem;
  color: #67b8cc;
  max-width: 380px;
}

.welcome-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  max-width: 600px;
  margin-top: 8px;
}

/* ── Suggestion chips ────────────────────────────────────── */
.chip {
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
  white-space: nowrap;
}

.chip--welcome {
  padding: 10px 18px;
  font-size: 0.85rem;
  background: rgba(34, 211, 238, 0.08);
  border: 1px solid rgba(34, 211, 238, 0.25);
  color: #a8dcea;
}

.chip--welcome:hover {
  background: rgba(34, 211, 238, 0.16);
  border-color: rgba(34, 211, 238, 0.5);
  color: #e2f0fb;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(34, 211, 238, 0.12);
}

.chip--inline {
  padding: 6px 14px;
  font-size: 0.78rem;
  background: rgba(34, 211, 238, 0.06);
  border: 1px solid rgba(34, 211, 238, 0.18);
  color: #7ec8da;
}

.chip--inline:hover {
  background: rgba(34, 211, 238, 0.13);
  border-color: rgba(34, 211, 238, 0.4);
  color: #d8eef9;
  transform: translateY(-1px);
}

/* ── Suggestions bar ─────────────────────────────────────── */
.suggestions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 820px;
  margin: 0 auto 10px;
  padding: 0 4px;
}

/* ── Input area ──────────────────────────────────────────── */
.input-area {
  flex-shrink: 0;
  padding: 12px 24px 12px;
  background: rgba(7, 22, 48, 0.9);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(34, 211, 238, 0.12);
}

.input-wrapper {
  display: flex;
  gap: 10px;
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
}

/* Override PrimeVue InputText for our theme */
.message-input {
  flex: 1;
  background: rgba(13, 34, 64, 0.8) !important;
  border: 1px solid rgba(34, 211, 238, 0.25) !important;
  border-radius: 12px !important;
  color: #e2f0fb !important;
  padding: 12px 18px !important;
  font-size: 0.92rem !important;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.message-input:focus {
  border-color: rgba(34, 211, 238, 0.6) !important;
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.12) !important;
  outline: none !important;
}

.message-input::placeholder {
  color: #4a7a8a !important;
}

.message-input:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
}

/* Override PrimeVue Button */
.send-button {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 46px !important;
  height: 46px !important;
  padding: 0 !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #0891b2, #22d3ee) !important;
  border: none !important;
  color: #040d1f !important;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.2s, transform 0.1s;
}

.send-button:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.send-button:active:not(:disabled) {
  transform: translateY(0);
}

.send-button:disabled {
  opacity: 0.35 !important;
  cursor: not-allowed !important;
}

.input-hint {
  text-align: center;
  font-size: 0.68rem;
  color: #2a4a5a;
  margin-top: 7px;
  letter-spacing: 0.02em;
}
</style>
