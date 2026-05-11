<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Loader2, CheckCircle2, ArrowRight, AlertTriangle } from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const authStore = useAuthStore()
const token = computed(() => String(route.params.token))
const sessionId = computed(() => String(route.query.session_id || ''))

const state = ref<'waiting' | 'ready' | 'timeout' | 'error'>('waiting')
const contestSlug = ref<string | null>(null)
const contestName = ref<string | null>(null)
const amountPaid = ref<number | null>(null)

let timer: ReturnType<typeof setTimeout> | null = null
const startedAt = Date.now()
const MAX_MS = 45_000

async function check() {
  try {
    const res = await $fetch<any>(
      `/api/public/inscriptions/${token.value}/confirm`,
      {
        query: { session_id: sessionId.value },
        headers: { Authorization: `Bearer ${authStore.session?.access_token ?? ''}` },
      }
    )
    if (res?.status === 'paid') {
      state.value = 'ready'
      contestSlug.value = res.contest_slug ?? null
      contestName.value = res.contest_name ?? null
      amountPaid.value  = res.amount_paid_cents ?? null
      return
    }
    if (Date.now() - startedAt > MAX_MS) {
      state.value = 'timeout'
      return
    }
    timer = setTimeout(check, 1500)
  } catch {
    if (Date.now() - startedAt > MAX_MS) {
      state.value = 'error'
      return
    }
    timer = setTimeout(check, 1500)
  }
}

onMounted(() => {
  if (!sessionId.value) { state.value = 'error'; return }
  check()
})
onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="w-full">
    <Card class="shadow-lg">
      <CardContent class="py-12 text-center space-y-5">
        <template v-if="state === 'waiting'">
          <div class="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center">
            <Loader2 class="w-7 h-7 animate-spin" />
          </div>
          <div class="space-y-1">
            <p class="text-xl font-bold">Procesando pago...</p>
            <p class="text-sm text-muted-foreground">
              Estamos confirmando tu inscripción. No cierres esta ventana.
            </p>
          </div>
        </template>

        <template v-else-if="state === 'ready'">
          <div class="w-16 h-16 mx-auto rounded-full bg-emerald-950/40 flex items-center justify-center">
            <CheckCircle2 class="w-8 h-8 text-emerald-400" />
          </div>
          <div class="space-y-1">
            <p class="text-xl font-bold">¡Inscripción confirmada!</p>
            <p class="text-sm text-muted-foreground">
              <template v-if="contestName">Te hemos añadido a <strong>{{ contestName }}</strong>.</template>
              <template v-else>Tu plaza está reservada.</template>
            </p>
            <p v-if="amountPaid" class="text-xs text-muted-foreground">
              Pagado: €{{ (amountPaid / 100).toFixed(2) }}
            </p>
          </div>
          <Button @click="navigateTo(contestSlug ? `/my-contests/${contestSlug}` : '/my-contests')">
            Ir a mi concurso <ArrowRight class="w-4 h-4 ml-2" />
          </Button>
        </template>

        <template v-else-if="state === 'timeout'">
          <div class="w-16 h-16 mx-auto rounded-full bg-amber-950/40 flex items-center justify-center">
            <AlertTriangle class="w-7 h-7 text-amber-400" />
          </div>
          <div class="space-y-1">
            <p class="text-xl font-bold">El pago sigue procesándose</p>
            <p class="text-sm text-muted-foreground">
              Stripe aún no ha confirmado. Recarga la página o revisa tu email en unos minutos.
            </p>
          </div>
          <Button variant="outline" @click="() => window.location.reload()">Recargar</Button>
        </template>

        <template v-else>
          <div class="w-16 h-16 mx-auto rounded-full bg-red-950/40 flex items-center justify-center">
            <AlertTriangle class="w-7 h-7 text-red-400" />
          </div>
          <div class="space-y-1">
            <p class="text-xl font-bold">No se pudo verificar</p>
            <p class="text-sm text-muted-foreground">Falta el identificador de sesión o hubo un error.</p>
          </div>
          <Button @click="navigateTo(`/join/${token}`)">Volver a la inscripción</Button>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
