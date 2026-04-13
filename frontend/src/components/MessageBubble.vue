<template>
  <div class="message-row" :class="message.role">

    <!-- Agent avatar (left side only) -->
    <div v-if="message.role === 'agent'" class="avatar agent-avatar" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
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

    <!-- Bubble -->
    <div class="bubble-wrapper" :class="message.role">

      <!-- Typing indicator -->
      <div v-if="message.loading" class="bubble agent-bubble typing-bubble" aria-label="L'agent réfléchit…">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span v-if="message.statusText" class="status-text">{{ message.statusText }}</span>
      </div>

      <!-- Text content -->
      <div v-else-if="message.type === 'text'" class="bubble" :class="message.role === 'agent' ? 'agent-bubble' : 'user-bubble'">
        <div v-if="message.role === 'agent'" class="bubble-text markdown" v-html="renderMarkdown(message.content)" />
        <p v-else class="bubble-text">{{ message.content }}</p>
      </div>

      <!-- Map -->
      <div v-else-if="message.type === 'map'" class="bubble agent-bubble visual-bubble">
        <div v-if="message.visual" class="bubble-text markdown" v-html="renderMarkdown(message.content)" />
        <MapView :visual="message.visual" />
      </div>

      <!-- Chart -->
      <div v-else-if="message.type === 'chart'" class="bubble agent-bubble visual-bubble">
        <div v-if="message.visual" class="bubble-text markdown" v-html="renderMarkdown(message.content)" />
        <ChartView :visual="message.visual" />
      </div>

    </div>

    <!-- User avatar (right side only) -->
    <div v-if="message.role === 'user'" class="avatar user-avatar" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="#94b4cc" stroke-width="2" fill="none"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#94b4cc" stroke-width="2" stroke-linecap="round" fill="none"/>
      </svg>
    </div>

  </div>
</template>

<script setup>
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import MapView from './MapView.vue'
import ChartView from './ChartView.vue'

marked.use({
  breaks: true,
  renderer: {
    image: () => '',   // Mistral génère parfois des liens image — on les supprime
  },
})

defineProps({
  message: {
    type: Object,
    required: true,
    // shape: { id, role: 'user'|'agent', type: 'text'|'map'|'chart', content: string, loading?: boolean }
  },
})

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text ?? ''))
}
</script>

<style scoped>
/* ── Row layout ──────────────────────────────────────────── */
.message-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 3px 0;
  animation: fade-up 0.22s ease-out both;
}

.message-row.user {
  flex-direction: row-reverse;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Avatars ─────────────────────────────────────────────── */
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  margin-bottom: 2px;
}

.agent-avatar {
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.3);
}

.user-avatar {
  background: rgba(100, 150, 180, 0.12);
  border: 1px solid rgba(100, 150, 180, 0.25);
}

/* ── Bubble wrapper ──────────────────────────────────────── */
.bubble-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 78%;
}

.message-row.agent:has(.visual-bubble) .bubble-wrapper {
  max-width: 96%;
  width: 96%;
}

.bubble-wrapper.user {
  align-items: flex-end;
}

.bubble-wrapper.agent {
  align-items: flex-start;
}

/* ── Bubbles ─────────────────────────────────────────────── */
.bubble {
  padding: 12px 16px;
  border-radius: 16px;
  line-height: 1.6;
  word-break: break-word;
}

.agent-bubble {
  background: rgba(13, 34, 64, 0.9);
  border: 1px solid rgba(34, 211, 238, 0.18);
  border-bottom-left-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.user-bubble {
  background: rgba(8, 60, 100, 0.85);
  border: 1px solid rgba(34, 211, 238, 0.15);
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.bubble-text {
  font-size: 0.9rem;
  color: #d8eef9;
  margin: 0;
  white-space: pre-wrap;
}

.bubble-text.markdown {
  white-space: normal;
}

.bubble-text.markdown :deep(p) {
  margin: 0 0 0.5em;
}
.bubble-text.markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.bubble-text.markdown :deep(ul),
.bubble-text.markdown :deep(ol) {
  margin: 0.4em 0 0.6em 1.2em;
  padding: 0;
}
.bubble-text.markdown :deep(li) {
  margin-bottom: 0.25em;
}
.bubble-text.markdown :deep(strong) {
  color: #22d3ee;
  font-weight: 600;
}
.bubble-text.markdown :deep(em) {
  color: #94d4e8;
}
.bubble-text.markdown :deep(code) {
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.2);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.85em;
  color: #22d3ee;
}

/* ── Typing animation ────────────────────────────────────── */
.typing-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 18px;
  min-width: 64px;
}

.status-text {
  font-size: 0.8rem;
  color: #67b8cc;
  margin-left: 4px;
  letter-spacing: 0.01em;
  animation: fade-in 0.2s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22d3ee;
  opacity: 0.7;
  animation: bounce-dot 1.4s ease-in-out infinite both;
}

.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.18s; }
.dot:nth-child(3) { animation-delay: 0.36s; }

@keyframes bounce-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.7; }
  30%            { transform: translateY(-7px); opacity: 1; }
}

/* ── Visual bubbles (map / chart) ────────────────────────── */
.visual-bubble {
  padding: 14px 16px;
  width: 100%;
}
</style>
