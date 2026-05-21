<script setup lang="ts">
import { ArrowLeft, AlertTriangle, FileQuestion } from 'lucide-vue-next'

const props = defineProps<{
  error: {
    statusCode: number
    statusMessage: string
    message: string
    stack: string
  }
}>()

const is404 = computed(() => props.error?.statusCode === 404)
const isDev = computed(() => import.meta.dev)

function goHome() {
  clearError({ redirect: '/' })
}

function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    window.history.back()
  } else {
    goHome()
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background px-4">
    <div class="max-w-md w-full text-center space-y-6">
      <!-- Icon -->
      <div class="mx-auto w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
        <FileQuestion v-if="is404" class="w-10 h-10 text-muted-foreground" />
        <AlertTriangle v-else class="w-10 h-10 text-amber-500" />
      </div>

      <!-- Status code -->
      <div class="space-y-2">
        <h1 class="text-6xl font-bold tracking-tight text-foreground">
          {{ error?.statusCode || 'Error' }}
        </h1>
        <p class="text-lg text-muted-foreground">
          <template v-if="is404">
            Página no encontrada
          </template>
          <template v-else>
            Algo salió mal
          </template>
        </p>
      </div>

      <!-- Message -->
      <p class="text-sm text-muted-foreground/80 max-w-xs mx-auto">
        {{ error?.message || error?.statusMessage || 'Ha ocurrido un error inesperado.' }}
      </p>

      <!-- Actions -->
      <div class="flex items-center justify-center gap-3 pt-2">
        <button
          class="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-muted text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
          @click="goBack"
        >
          <ArrowLeft class="w-4 h-4" />
          Volver
        </button>
        <button
          class="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-zinc-900 text-sm font-medium text-zinc-50 hover:bg-zinc-800 transition-colors dark:bg-zinc-100 dark:text-zinc-900"
          @click="goHome"
        >
          Ir al inicio
        </button>
      </div>

      <!-- Stack trace (dev only) -->
      <details v-if="error?.stack && isDev" class="mt-8 text-left">
        <summary class="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
          Ver stack trace (development)
        </summary>
        <pre class="mt-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap">{{ error.stack }}</pre>
      </details>
    </div>
  </div>
</template>
