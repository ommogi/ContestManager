<!-- app/components/assistant/AssistantPanel.vue -->
<!-- The organiser's assistant (feat/ai, Sidekick-style). Asks about the
     organisation's contests and gets answers plus proposal cards. A card only
     does something when the organiser presses "Confirmar", which calls the
     existing endpoint with their own session. The conversation lives in this
     component only: nothing is stored. -->
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { AlertTriangle, Check, Loader2, Send, Sparkles, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { apiClient } from '@/api/apiClient'
import { useEmailComposer, type ComposerAudience } from '@/composables/useEmailComposer'

interface Proposal {
  kind: 'request' | 'email'
  title: string
  description: string
  request?: { method: 'PATCH' | 'POST', url: string, body: Record<string, unknown> }
  email?: { contestId: string, contestName: string, audience: ComposerAudience, intent: string }
  warnings: string[]
}

interface Entry {
  role: 'user' | 'assistant'
  content: string
  proposals?: Array<Proposal & { state: 'pending' | 'applying' | 'done' | 'dismissed' }>
}

const open = defineModel<boolean>('open', { default: false })

const route = useRoute()
const { openComposer } = useEmailComposer()

const entries = ref<Entry[]>([])
const draft = ref('')
const thinking = ref(false)
const scroller = ref<HTMLElement | null>(null)

const SUGGESTIONS = [
  '¿Quién toca después en la ronda abierta?',
  '¿Cuántos inscritos faltan por pagar?',
  '¿A qué jurados les falta votar?',
]

const pageContext = computed(() => {
  const p = route.params as Record<string, string | undefined>
  return {
    contestSlug: route.path.startsWith('/contests/') ? p.slug ?? null : null,
    categoryId: p.id ?? null,
    roundId: p.roundId ?? null,
    today: new Date().toISOString().slice(0, 10),
  }
})

function scrollDown() {
  nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight })
}

function errorMessage(error: unknown, fallback: string): string {
  const e = error as { data?: { message?: string, statusMessage?: string } } | null
  return e?.data?.message || e?.data?.statusMessage || fallback
}

async function ask(text?: string) {
  const content = (text ?? draft.value).trim()
  if (!content || thinking.value) return
  draft.value = ''
  entries.value.push({ role: 'user', content })
  scrollDown()
  thinking.value = true
  try {
    const res = await apiClient<{ reply: string, proposals: Proposal[] }>('/api/assistant/chat', {
      method: 'POST',
      body: {
        messages: entries.value.map(e => ({ role: e.role, content: e.content })),
        context: pageContext.value,
      },
    })
    entries.value.push({
      role: 'assistant',
      content: res.reply,
      proposals: res.proposals.map(p => ({ ...p, state: 'pending' as const })),
    })
  } catch (error) {
    entries.value.push({ role: 'assistant', content: errorMessage(error, 'No he podido responder. Prueba de nuevo.') })
  } finally {
    thinking.value = false
    scrollDown()
  }
}

async function confirm(p: NonNullable<Entry['proposals']>[number]) {
  if (p.kind === 'email' && p.email) {
    openComposer(p.email.contestId, { contestName: p.email.contestName, prefill: { audience: p.email.audience, intent: p.email.intent } })
    p.state = 'done'
    open.value = false
    return
  }
  if (!p.request) return
  p.state = 'applying'
  try {
    await apiClient(p.request.url, { method: p.request.method, body: p.request.body })
    p.state = 'done'
    toast.success('Hecho', { description: p.title })
    await refreshNuxtData()
  } catch (error) {
    p.state = 'pending'
    toast.error(errorMessage(error, 'No se pudo aplicar'), { description: p.title })
  }
}

function reset() {
  entries.value = []
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="w-full sm:max-w-md flex flex-col p-0 gap-0">
      <SheetHeader class="px-5 py-4 border-b">
        <SheetTitle class="flex items-center gap-2">
          <Sparkles class="w-4 h-4" /> Asistente
        </SheetTitle>
        <SheetDescription>
          Pregunta por tus concursos. Si propone un cambio, tú decides si se aplica.
        </SheetDescription>
      </SheetHeader>

      <div ref="scroller" class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div v-if="entries.length === 0" class="space-y-2">
          <p class="text-xs text-muted-foreground">Prueba con:</p>
          <button
            v-for="s in SUGGESTIONS"
            :key="s"
            class="block w-full text-left text-sm rounded-xl border-2 px-3 py-2 hover:bg-muted transition-colors"
            @click="ask(s)"
          >
            {{ s }}
          </button>
        </div>

        <div v-for="(e, i) in entries" :key="i" :class="e.role === 'user' ? 'flex justify-end' : ''">
          <div
            class="rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap max-w-[90%]"
            :class="e.role === 'user' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-muted'"
          >
            {{ e.content }}
          </div>

          <div v-for="(p, j) in e.proposals ?? []" :key="j" class="mt-2 rounded-xl border-2 p-3 space-y-2">
            <p class="text-sm font-semibold">{{ p.title }}</p>
            <p class="text-xs text-muted-foreground">{{ p.description }}</p>
            <p v-for="w in p.warnings" :key="w" class="text-xs flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
              <AlertTriangle class="w-3.5 h-3.5 mt-0.5 shrink-0" /> {{ w }}
            </p>
            <div v-if="p.state === 'pending' || p.state === 'applying'" class="flex gap-2 pt-1">
              <Button size="sm" class="gap-1.5" :disabled="p.state === 'applying'" @click="confirm(p)">
                <Loader2 v-if="p.state === 'applying'" class="w-3.5 h-3.5 animate-spin" />
                <Check v-else class="w-3.5 h-3.5" />
                {{ p.kind === 'email' ? 'Abrir redactor' : 'Confirmar' }}
              </Button>
              <Button size="sm" variant="ghost" class="gap-1.5" :disabled="p.state === 'applying'" @click="p.state = 'dismissed'">
                <X class="w-3.5 h-3.5" /> Descartar
              </Button>
            </div>
            <p v-else class="text-xs font-semibold" :class="p.state === 'done' ? 'text-emerald-600' : 'text-muted-foreground'">
              {{ p.state === 'done' ? 'Aplicado' : 'Descartado' }}
            </p>
          </div>
        </div>

        <div v-if="thinking" class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 class="w-4 h-4 animate-spin" /> Consultando…
        </div>
      </div>

      <div class="border-t p-3 space-y-2">
        <div class="flex gap-2">
          <Textarea
            v-model="draft"
            rows="2"
            class="resize-none"
            placeholder="Escribe tu pregunta…"
            :disabled="thinking"
            @keydown.enter.exact.prevent="ask()"
          />
          <Button size="icon" class="shrink-0 self-end" :disabled="thinking || !draft.trim()" @click="ask()">
            <Send class="w-4 h-4" />
          </Button>
        </div>
        <button v-if="entries.length" class="text-[11px] text-muted-foreground hover:underline" @click="reset">
          Nueva conversación
        </button>
      </div>
    </SheetContent>
  </Sheet>
</template>
