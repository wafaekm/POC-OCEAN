<template>
  <div class="app-root">
    <ChatInterface />
  </div>
</template>

<script setup>
import ChatInterface from './components/ChatInterface.vue'
</script>

<style>
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app, .app-root {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: #040d1f;
  color: #e2f0fb;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(34, 211, 238, 0.25);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 211, 238, 0.45);
}
</style>
