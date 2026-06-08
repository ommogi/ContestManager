<script setup lang="ts">
import { ArrowLeft, Trophy, Calendar, CalendarClock, ChevronRight, Layers, Users, Activity, ListTree, Search, X, Loader2, Receipt } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { marked } from 'marked'

const DEFAULT_COVER = 'https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/default-cover.png'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getStatusClasses, getStatusBannerClasses, getTypeBannerClasses } from '@/utils/styles'

const route = useRoute()
const authStore = useAuthStore()
const { setMeta, clearMeta } = useBreadcrumbMeta()
onUnmounted(() => clearMeta())

const { data, error, refresh } = useFetch(`/api/my/contests/${route.params.slug}`, {
  server: false,
  lazy: true,
  headers: computed(() => ({
    Authorization: `Bearer ${authStore.session?.access_token ?? ''}`
  })),
  watch: [computed(() => authStore.session?.access_token)]
})

const contest = computed(() => (data.value as any)?.contest ?? null)
watch(contest, (c) => { if (c?.name) setMeta({ contest: c.name }) }, { immediate: true })
const participantEntries = computed(() => (data.value as any)?.participant ?? [])
const member = computed(() => (data.value as any)?.member ?? null)
const isJudge = computed(() => member.value?.role === 'judge')
const categories = computed(() => (data.value as any)?.categories ?? [])
const rounds = computed(() => (data.value as any)?.rounds ?? [])

function categoryRole(catId: string): 'participant' | 'judge' {
  return participantEntries.value.some((p: any) => p.category_id === catId) ? 'participant' : 'judge'
}

function categoryRoundCount(catId: string): number {
  return rounds.value.filter((r: any) => r.category_id === catId).length
}

// Can cancel if no non-pending rounds in that category
function canCancel(catId: string): boolean {
  return !rounds.value.some((r: any) => r.category_id === catId && r.status !== 'pending')
}

const cancellingId = ref<string | null>(null)
const cancelTarget = ref<any | null>(null)
const showCancelDialog = ref(false)
const receiptLoadingId = ref<string | null>(null)

async function openReceipt(p: any) {
  receiptLoadingId.value = p.id
  try {
    const r = await $fetch<any>(`/api/participants/${p.id}/receipt`, {
      headers: { Authorization: `Bearer ${authStore.session?.access_token ?? ''}` },
    })
    if (r?.receipt_url) {
      window.open(r.receipt_url, '_blank', 'noopener')
    } else {
      toast.error('Recibo no disponible todavía')
    }
  } catch (e: any) {
    toast.error(e?.statusMessage || 'Error al abrir recibo')
  } finally {
    receiptLoadingId.value = null
  }
}

function requestCancel(p: any) {
  if (!canCancel(p.category_id)) {
    toast.error('No puedes cancelar: las rondas ya han comenzado.')
    return
  }
  cancelTarget.value = p
  showCancelDialog.value = true
}

async function confirmCancel() {
  const p = cancelTarget.value
  if (!p) return
  showCancelDialog.value = false
  cancellingId.value = p.id
  try {
    const r = await $fetch<any>(`/api/participants/${p.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authStore.session?.access_token ?? ''}` },
    })
    toast.success(r?.refund ? 'Inscripción cancelada. Reembolso emitido.' : 'Inscripción cancelada.')
    await refresh()
  } catch (e: any) {
    toast.error(e?.statusMessage || 'Error al cancelar')
  } finally {
    cancellingId.value = null
    cancelTarget.value = null
  }
}

function formatDate(date: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!date) return 'Sin fecha'
  return new Date(date).toLocaleDateString('es-ES', opts)
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: 'Borrador', active: 'Activo', finished: 'Finalizado', cancelled: 'Cancelado',
    pending: 'Pendiente', closed: 'Cerrado'
  }
  return map[status] ?? status
}

// ── Filter / search ──────────────────────────────────────────────
const searchQuery = ref('')
const statusFilter = ref<'all' | 'pending' | 'active' | 'closed'>('all')

const filteredCategories = computed(() => {
  const list = categories.value ?? []
  const q = searchQuery.value.trim().toLowerCase()
  return list.filter((c: any) => {
    if (statusFilter.value !== 'all' && c.status !== statusFilter.value) return false
    if (q && !c.name.toLowerCase().includes(q) && !(c.description || '').toLowerCase().includes(q)) return false
    return true
  })
})

const statusCounts = computed(() => {
  const base: Record<string, number> = { all: 0, pending: 0, active: 0, closed: 0 }
  for (const c of (categories.value ?? [])) {
    base.all++
    base[(c as any).status] = (base[(c as any).status] || 0) + 1
  }
  return base
})

function statusChipClasses(s: 'all' | 'pending' | 'active' | 'closed') {
  const active = statusFilter.value === s
  return active
    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
    : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
}

const categoryStatusBadge = (s: string) => ({
  pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-500/30',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-500/30',
  closed: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700',
}[s as 'pending' | 'active' | 'closed'] ?? '')

const activeTab = ref('categorias')
const parsedDescription = computed(() => marked.parse(contest.value?.description || '') as string)
const parsedRules = computed(() => marked.parse(contest.value?.rules || '') as string)
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1400px] mx-auto">

    <!-- Error -->
    <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-600 dark:text-red-400">
      No se pudo cargar el concurso. Puede que no estés inscrito o el concurso no existe.
    </div>

    <template v-if="contest">
      <!-- Not started banner -->
      <div
        v-if="contest.status === 'draft'"
        class="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/40 p-4 flex items-center gap-3"
      >
        <CalendarClock class="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-amber-900 dark:text-amber-200">El concurso aún no ha empezado</p>
          <p class="text-xs text-amber-800 dark:text-amber-300/80">
            El organizador aún no ha iniciado el concurso. Recibirás notificación cuando arranque.
          </p>
        </div>
      </div>
      <!-- Banner -->
      <div
        class="relative w-full h-56 md:h-72 rounded-2xl overflow-hidden border-2 border-border shadow-sm bg-muted bg-center bg-cover"
        :style="`background-image: url('${contest.cover_image_url || DEFAULT_COVER}')`"
      >
        <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/50"></div>

        <div class="absolute top-0 left-0 right-0 p-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap gap-2">
            <Badge
              class="capitalize px-3 py-1 font-bold tracking-tight shadow-sm border-2 rounded-md backdrop-blur-sm"
              :class="getStatusBannerClasses(contest.status)"
            >
              <Activity class="w-3.5 h-3.5 mr-1.5" />
              {{ statusLabel(contest.status) }}
            </Badge>

            <Badge
              variant="outline"
              class="capitalize px-3 py-1 font-semibold border-2 rounded-md backdrop-blur-sm"
              :class="getTypeBannerClasses(contest.type)"
            >
              <Trophy class="w-3.5 h-3.5 mr-1.5" />
              {{ contest.type }}
            </Badge>
          </div>

          <div class="hidden lg:flex flex-wrap items-center gap-5 text-[11px] text-white/90 uppercase font-bold tracking-tighter drop-shadow">
            <div class="flex items-center gap-1.5">
              <Calendar class="w-3.5 h-3.5" />
              <span class="opacity-80">Duración:</span>
              <span>{{ formatDate(contest.starts_at, { day: '2-digit', month: '2-digit', year: 'numeric' }) }} — {{ formatDate(contest.ends_at, { day: '2-digit', month: '2-digit', year: 'numeric' }) }}</span>
            </div>
          </div>
        </div>

        <div class="absolute bottom-0 left-0 right-0 p-6">
          <div class="flex items-end gap-3">
            <NuxtLink to="/my-contests" class="p-1 rounded-md hover:bg-white/10 transition-colors shrink-0">
              <ArrowLeft class="w-4 h-4 text-white drop-shadow-md" />
            </NuxtLink>
            <div class="flex-1 min-w-0">
              <h1 class="text-2xl md:text-4xl font-bold tracking-tight uppercase text-white drop-shadow-md">
                {{ contest.name }}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <!-- My enrollments (participant only) -->
      <div v-if="!isJudge && participantEntries.length" class="space-y-2 pt-4">
        <h3 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Mis inscripciones
        </h3>
        <div class="space-y-2">
          <div
            v-for="p in participantEntries"
            :key="p.id"
            class="flex items-center justify-between gap-3 rounded-lg border-2 border-border bg-card p-3"
          >
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold truncate">{{ p.categories?.name }}</p>
              <div class="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                <span v-if="p.payment_status === 'paid'" class="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Pagado · €{{ ((p.amount_paid_cents || 0) / 100).toFixed(2) }}
                </span>
                <span v-else-if="p.payment_status === 'refunded'" class="text-orange-600 dark:text-orange-400 font-semibold">
                  Reembolsado
                </span>
                <span v-else>Gratuito</span>
                <span v-if="!canCancel(p.category_id)" class="text-destructive">
                  · Rondas iniciadas (no cancelable)
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button
                v-if="p.stripe_payment_intent_id && (p.payment_status === 'paid' || p.payment_status === 'refunded' || p.payment_status === 'partial_refund')"
                variant="ghost"
                size="sm"
                :disabled="receiptLoadingId === p.id"
                @click="openReceipt(p)"
              >
                <Loader2 v-if="receiptLoadingId === p.id" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
                <Receipt v-else class="w-3.5 h-3.5 mr-1.5" />
                Recibo
              </Button>
              <Button
                v-if="canCancel(p.category_id) && p.payment_status !== 'refunded'"
                variant="outline"
                size="sm"
                :disabled="cancellingId === p.id"
                @click="requestCancel(p)"
              >
                <Loader2 v-if="cancellingId === p.id" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
                <X v-else class="w-3.5 h-3.5 mr-1.5" />
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab section -->
      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="w-full justify-start rounded-none border-b border-zinc-200 dark:border-zinc-800 bg-transparent h-auto gap-1 px-0 pb-0">
          <TabsTrigger
            value="categorias"
            class="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 dark:data-[state=active]:border-zinc-100 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100 text-zinc-500 pb-3 pt-2 px-4 text-sm font-semibold transition-colors"
          >
            Categorías
            <span v-if="categories?.length" class="ml-1.5 text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full px-1.5 py-0.5">{{ categories.length }}</span>
          </TabsTrigger>
          <TabsTrigger
            value="descripcion"
            class="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 dark:data-[state=active]:border-zinc-100 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100 text-zinc-500 pb-3 pt-2 px-4 text-sm font-semibold transition-colors"
          >
            Descripción
          </TabsTrigger>
          <TabsTrigger
            value="reglamento"
            class="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 dark:data-[state=active]:border-zinc-100 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-zinc-900 dark:data-[state=active]:text-zinc-100 text-zinc-500 pb-3 pt-2 px-4 text-sm font-semibold transition-colors"
          >
            Reglamento
          </TabsTrigger>
        </TabsList>

        <!-- Categorías tab -->
        <TabsContent value="categorias" class="mt-0">
          <div class="space-y-5 pt-4">
            <!-- Filter bar -->
            <div v-if="categories?.length" class="flex flex-wrap items-center gap-3">
              <div class="relative flex-1 max-w-sm min-w-[200px]">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  v-model="searchQuery"
                  placeholder="Buscar categoría..."
                  class="pl-9 h-10 border-2"
                />
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="s in (['all','pending','active','closed'] as const)"
                  :key="s"
                  type="button"
                  class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md border-2 transition-all flex items-center gap-1.5"
                  :class="statusChipClasses(s)"
                  @click="statusFilter = s"
                >
                  {{ s === 'all' ? 'Todas' : statusLabel(s) }}
                  <span class="text-[9px] opacity-70">{{ statusCounts[s] }}</span>
                </button>
              </div>
            </div>

            <!-- List -->
            <div v-if="categories?.length && filteredCategories.length" class="border-2 border-border rounded-xl overflow-hidden bg-card divide-y divide-border">
              <NuxtLink
                v-for="cat in filteredCategories"
                :key="cat.id"
                :to="`/my-contests/${contest.slug}/categories/${cat.id}`"
                class="group flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div class="p-2.5 bg-muted rounded-lg group-hover:bg-zinc-900 group-hover:text-white transition-all shrink-0">
                  <ListTree class="w-5 h-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-zinc-900 dark:text-zinc-100 truncate">{{ cat.name }}</span>
                    <Badge
                      class="text-[9px] font-bold uppercase tracking-widest border-2 rounded-md"
                      :class="categoryStatusBadge(cat.status)"
                    >
                      {{ statusLabel(cat.status) }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground truncate mt-0.5">
                    {{ cat.description || 'Sin descripción' }}
                  </p>
                </div>
                <div class="hidden md:flex items-center gap-4 text-[11px] uppercase font-bold tracking-tight text-muted-foreground shrink-0">
                  <div class="flex items-center gap-1.5">
                    <Layers class="w-3.5 h-3.5" />
                    <span>{{ categoryRoundCount(cat.id) }}</span>
                    <span class="opacity-60">{{ categoryRoundCount(cat.id) === 1 ? 'ronda' : 'rondas' }}</span>
                  </div>
                  <Badge
                    v-if="categoryRole(cat.id) === 'judge'"
                    class="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-500/30 text-[9px] h-5 border-2 rounded-md font-bold px-2"
                  >JURADO</Badge>
                  <Badge
                    v-else
                    class="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-500/30 text-[9px] h-5 border-2 rounded-md font-bold px-2"
                  >PARTICIPANTE</Badge>
                </div>
                <ChevronRight class="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all shrink-0" />
              </NuxtLink>
            </div>

            <!-- No results after filter -->
            <div v-else-if="categories?.length && !filteredCategories.length" class="rounded-xl border-2 border-dashed border-border bg-muted/30 py-10 text-center">
              <p class="text-sm text-muted-foreground">Sin resultados con los filtros actuales.</p>
            </div>

            <!-- Empty -->
            <div v-else class="rounded-xl border-2 border-dashed border-border bg-muted/30 py-12 text-center">
              <Trophy class="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p class="text-sm text-muted-foreground">{{ isJudge ? 'El organizador aún no ha creado categorías en este concurso.' : 'No estás inscrito como participante en ninguna categoría de este concurso.' }}</p>
            </div>
          </div>
        </TabsContent>

        <!-- Descripción tab -->
        <TabsContent value="descripcion" class="mt-0 pt-6 pb-4">
          <div
            v-if="contest?.description"
            class="rich-content text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed"
            v-html="parsedDescription"
          />
          <div v-else class="flex flex-col items-center justify-center py-16 text-center">
            <ListTree class="w-6 h-6 text-zinc-400 mb-4" />
            <p class="text-sm font-medium text-zinc-500">Sin descripción</p>
          </div>
        </TabsContent>

        <!-- Reglamento tab -->
        <TabsContent value="reglamento" class="mt-0 pt-6 pb-4">
          <div
            v-if="contest?.rules"
            class="rich-content text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed"
            v-html="parsedRules"
          />
          <div v-else class="flex flex-col items-center justify-center py-16 text-center">
            <ListTree class="w-6 h-6 text-zinc-400 mb-4" />
            <p class="text-sm font-medium text-zinc-500">Sin reglamento publicado</p>
          </div>
        </TabsContent>
      </Tabs>
    </template>

    <!-- Cancel participant dialog -->
    <AlertDialog v-model:open="showCancelDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar inscripción</AlertDialogTitle>
          <AlertDialogDescription>
            {{ cancelTarget?.payment_status === 'paid'
              ? '¿Cancelar inscripción y solicitar reembolso?'
              : '¿Cancelar inscripción?' }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No cancelar</AlertDialogCancel>
          <AlertDialogAction :disabled="!!cancellingId" @click="confirmCancel">
            <Loader2 v-if="cancellingId" class="w-3.5 h-3.5 animate-spin mr-1" />
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
