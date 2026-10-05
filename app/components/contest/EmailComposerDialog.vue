<!-- app/components/contest/EmailComposerDialog.vue -->
<!-- The organisation writes to its participants or jury, by hand or drafted by
     AI (feat/ai). Mounted once in the layout and opened with useEmailComposer.
     Sending always goes through a dry run first: the organiser sees how many
     people will get it before anything leaves. -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Loader2, Mail, Send, Sparkles, Users } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiClient } from '@/api/apiClient'
import { useEmailComposer, type ComposerAudience } from '@/composables/useEmailComposer'

const { state, closeComposer } = useEmailComposer()

const open = computed({
  get: () => state.value.open,
  set: (v: boolean) => { if (!v) closeComposer() },
})

interface Option { value: string, label: string }
const audienceOptions = ref<Option[]>([])
const audienceKey = ref('all_participants')
const payment = ref<'any' | 'pending' | 'paid' | 'free'>('any')
const intent = ref('')
const subject = ref('')
const body = ref('')

const loadingOptions = ref(false)
const drafting = ref(false)
const checking = ref(false)
const sending = ref(false)
const preview = ref<{ count: number, recipients: string[] } | null>(null)

function audienceFromKey(key: string): ComposerAudience {
  if (key === 'judges') return { type: 'judges' }
  if (key.startsWith('category:')) return { type: 'category', categoryId: key.slice(9) }
  if (key.startsWith('round:')) return { type: 'round', roundId: key.slice(6) }
  return { type: 'all_participants' }
}

function keyFromAudience(a?: ComposerAudience): string {
  if (!a) return 'all_participants'
  if (a.type === 'category') return `category:${a.categoryId}`
  if (a.type === 'round') return `round:${a.roundId}`
  return a.type
}

function errorMessage(error: unknown, fallback: string): string {
  const e = error as { data?: { message?: string, statusMessage?: string }, statusMessage?: string } | null
  return e?.data?.message || e?.data?.statusMessage || e?.statusMessage || fallback
}

async function loadOptions(contestId: string) {
  loadingOptions.value = true
  try {
    const [categories, rounds] = await Promise.all([
      apiClient<Array<{ id: string, name: string }>>(`/api/contests/${contestId}/categories`),
      apiClient<Array<{ id: string, name: string, categories?: { name?: string } | null }>>(`/api/contests/${contestId}/rounds`),
    ])
    audienceOptions.value = [
      { value: 'all_participants', label: 'Todos los participantes' },
      ...(categories ?? []).map(c => ({ value: `category:${c.id}`, label: `Categoría · ${c.name}` })),
      ...(rounds ?? []).map(r => ({ value: `round:${r.id}`, label: `Ronda · ${r.categories?.name ? `${r.categories.name} — ` : ''}${r.name}` })),
      { value: 'judges', label: 'Jurado' },
    ]
  } catch (error) {
    toast.error(errorMessage(error, 'No se pudieron cargar las categorías'))
  } finally {
    loadingOptions.value = false
  }
}

watch(() => state.value.open, async (isOpen) => {
  if (!isOpen || !state.value.contestId) return
  const p = state.value.prefill
  audienceKey.value = keyFromAudience(p?.audience)
  payment.value = 'any'
  subject.value = p?.subject ?? ''
  body.value = p?.body ?? ''
  intent.value = p?.intent ?? ''
  preview.value = null
  await loadOptions(state.value.contestId)
  if (p?.intent && !p.subject && !p.body) await draftWithAi()
})

// Any change to who or what invalidates the count shown.
watch([audienceKey, payment, subject, body], () => { preview.value = null })

const canDraft = computed(() => intent.value.trim().length > 0 && !drafting.value)
const canCheck = computed(() => subject.value.trim() && body.value.trim() && !checking.value && !sending.value)

function requestBody(dryRun: boolean) {
  return {
    audience: audienceFromKey(audienceKey.value),
    ...(payment.value !== 'any' ? { paymentStatus: payment.value } : {}),
    subject: subject.value,
    body: body.value,
    dryRun,
  }
}

async function draftWithAi() {
  if (!state.value.contestId || !intent.value.trim()) return
  drafting.value = true
  try {
    const res = await apiClient<{ subject: string, body: string }>(
      `/api/contests/${state.value.contestId}/email.ai-draft`,
      { method: 'POST', body: { intent: intent.value, audience: audienceFromKey(audienceKey.value) } },
    )
    subject.value = res.subject
    body.value = res.body
    if (res.body.includes('[COMPLETAR')) {
      toast.warning('Revisa el borrador', { description: 'La IA ha marcado con [COMPLETAR] datos que no tenía.' })
    }
  } catch (error) {
    toast.error(errorMessage(error, 'La IA no ha podido redactar el correo'))
  } finally {
    drafting.value = false
  }
}

async function checkRecipients() {
  if (!state.value.contestId) return
  checking.value = true
  try {
    preview.value = await apiClient<{ count: number, recipients: string[] }>(
      `/api/contests/${state.value.contestId}/emails`,
      { method: 'POST', body: requestBody(true) },
    )
  } catch (error) {
    toast.error(errorMessage(error, 'No se pudo calcular a quién se envía'))
  } finally {
    checking.value = false
  }
}

async function send() {
  if (!state.value.contestId || !preview.value?.count) return
  sending.value = true
  try {
    const res = await apiClient<{ sent: number, failed: number, duplicates: number }>(
      `/api/contests/${state.value.contestId}/emails`,
      { method: 'POST', body: requestBody(false) },
    )
    if (res.failed > 0) {
      toast.warning(`Enviado a ${res.sent}; ${res.failed} no se pudieron enviar`)
    } else {
      toast.success(`Correo enviado a ${res.sent} ${res.sent === 1 ? 'persona' : 'personas'}`,
        res.duplicates ? { description: `${res.duplicates} ya lo habían recibido antes.` } : undefined)
    }
    closeComposer()
  } catch (error) {
    toast.error(errorMessage(error, 'No se pudo enviar el correo'))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Mail class="w-4 h-4" />
          Enviar email{{ state.contestName ? ` · ${state.contestName}` : '' }}
        </DialogTitle>
        <DialogDescription>
          Escribe a tus participantes o al jurado. Antes de enviar verás a cuántas personas llega.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5">
        <div class="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div class="space-y-1.5">
            <Label>Para</Label>
            <Select v-model="audienceKey" :disabled="loadingOptions">
              <SelectTrigger><SelectValue placeholder="Elige destinatarios" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="o in audienceOptions" :key="o.value" :value="o.value">{{ o.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-1.5">
            <Label>Pago</Label>
            <Select v-model="payment" :disabled="audienceKey === 'judges'">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Cualquiera</SelectItem>
                <SelectItem value="pending">Pendiente de pago</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="free">Gratuito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="rounded-xl border-2 border-dashed p-3 space-y-2">
          <Label class="flex items-center gap-1.5"><Sparkles class="w-3.5 h-3.5" /> Escribir con IA</Label>
          <div class="flex gap-2">
            <Input
              v-model="intent"
              placeholder="Ej.: recordar que mañana la convocatoria es a las 9 en el auditorio"
              :disabled="drafting"
              @keydown.enter.prevent="draftWithAi"
            />
            <Button variant="outline" class="gap-2 shrink-0" :disabled="!canDraft" @click="draftWithAi">
              <Loader2 v-if="drafting" class="w-4 h-4 animate-spin" />
              <Sparkles v-else class="w-4 h-4" />
              Redactar
            </Button>
          </div>
        </div>

        <div class="space-y-1.5">
          <Label>Asunto</Label>
          <Input v-model="subject" maxlength="200" placeholder="Asunto del correo" />
        </div>
        <div class="space-y-1.5">
          <Label>Mensaje</Label>
          <Textarea v-model="body" rows="10" placeholder="Escribe el mensaje. Deja una línea en blanco entre párrafos." />
        </div>

        <div v-if="preview" class="rounded-xl border-2 px-4 py-3 text-sm flex items-start gap-3">
          <Users class="w-4 h-4 mt-0.5 shrink-0" />
          <div class="min-w-0">
            <p class="font-semibold">
              {{ preview.count === 0 ? 'Nadie en este grupo tiene email' : `Se enviará a ${preview.count} ${preview.count === 1 ? 'persona' : 'personas'}` }}
            </p>
            <p v-if="preview.count" class="text-xs text-muted-foreground truncate">
              {{ preview.recipients.slice(0, 8).join(', ') }}{{ preview.count > 8 ? ` y ${preview.count - 8} más` : '' }}
            </p>
          </div>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="ghost" :disabled="sending" @click="closeComposer">Cancelar</Button>
        <Button v-if="!preview" class="gap-2" :disabled="!canCheck" @click="checkRecipients">
          <Loader2 v-if="checking" class="w-4 h-4 animate-spin" />
          <Users v-else class="w-4 h-4" />
          Revisar destinatarios
        </Button>
        <Button v-else class="gap-2" :disabled="sending || !preview.count" @click="send">
          <Loader2 v-if="sending" class="w-4 h-4 animate-spin" />
          <Send v-else class="w-4 h-4" />
          Enviar a {{ preview.count }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
