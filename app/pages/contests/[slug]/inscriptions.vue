<script setup lang="ts">
import { toast } from 'vue-sonner'
import { storeToRefs } from 'pinia'
import { ArrowLeft, Search, Link2, Check, Users, Trash2, Mail, Phone, MapPin, Calendar, Lock, Unlock, Download, Upload, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useContestStore } from '@/stores/contest'
import { useParticipantsStore } from '@/stores/participants'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ImportCsvDialog from '@/components/contest/ImportCsvDialog.vue'
import InscriptionFormTab from '@/components/inscription/InscriptionFormTab.vue'
import { apiClient } from '@/api/apiClient'

const route = useRoute()
const contestStore = useContestStore()
const participantsStore = useParticipantsStore()
const authStore = useAuthStore()
const { currentContest, categories, participants } = storeToRefs(contestStore)

await contestStore.fetchContest(route.params.slug as string)

// ── CSV import ──────────────────────────────────────────────────────────────
const importOpen = ref(false)
const ticketBalance = ref(0)

async function fetchTicketBalance() {
  try {
    const b = await $fetch<any>('/api/billing/balance', {
      headers: { Authorization: `Bearer ${authStore.session?.access_token ?? ''}` },
    })
    ticketBalance.value = b?.organization?.ticket_balance ?? 0
  } catch { ticketBalance.value = 0 }
}
fetchTicketBalance()

async function openImport() {
  await fetchTicketBalance()
  importOpen.value = true
}

// Re-open import dialog after Stripe top-up success (success_url returned us here
// with ?import=open and ?topup=success). Strip those params from the URL once handled.
const router = useRouter()
onMounted(async () => {
  const q = route.query
  if (q.import === 'open') {
    if (q.topup === 'success') {
      // Give webhook a moment to credit; refresh balance after short delay
      setTimeout(() => fetchTicketBalance(), 1500)
      toast.success('Compra completada · Tickets acreditados')
    } else if (q.topup === 'cancel') {
      toast.info('Compra cancelada')
    }
    await openImport()
    // Clean URL
    const { import: _i, topup: _t, session_id: _s, ...rest } = q as any
    router.replace({ query: rest })
  }
})

async function onImported(count: number) {
  toast.success(`${count} inscripciones importadas`)
  importOpen.value = false
  // Refresh participants + balance
  const cid = currentContest.value?.id
  if (cid) {
    participantsStore.invalidate(cid)
    try { await participantsStore.fetch(cid) } catch (e) { console.error('[inscriptions] fetch failed:', e) }
  }
  fetchTicketBalance()
}

// ── Filters & Pagination ─────────────────────────────────────────────────────
const searchQuery = ref('')
const categoryFilter = ref<string>('all')
const paymentFilter = ref<string>('all')
const sortOrder = ref<'newest' | 'oldest' | 'name-asc' | 'name-desc'>('newest')

const currentPage = ref(1)
const pageSize = ref(10)

const categoryById = computed(() => {
  const m: Record<string, any> = {}
  for (const c of categories.value ?? []) m[c.id] = c
  return m
})

const filteredInscriptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = (participants.value ?? []).slice()

  // Apply filters
  const filtered = list.filter((p: any) => {
    if (categoryFilter.value !== 'all' && p.category_id !== categoryFilter.value) return false
    
    if (paymentFilter.value !== 'all') {
      if (paymentFilter.value === 'paid' && p.payment_status !== 'paid') return false
      if (paymentFilter.value === 'refunded' && p.payment_status !== 'refunded') return false
      if (paymentFilter.value === 'partial_refund' && p.payment_status !== 'partial_refund') return false
      if (paymentFilter.value === 'free' && p.payment_status !== 'free' && p.payment_status !== 'zero') return false
    }

    if (!q) return true
    const hay = [p.name, p.first_name, p.last_name, p.email, p.dni, p.phone, p.country]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase())
    return hay.some(h => h.includes(q))
  })

  // Apply sorting
  if (sortOrder.value === 'newest') {
    filtered.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } else if (sortOrder.value === 'oldest') {
    filtered.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  } else if (sortOrder.value === 'name-asc') {
    filtered.sort((a: any, b: any) => {
      const nameA = (a.name || `${a.first_name ?? ''} ${a.last_name ?? ''}`).trim().toLowerCase()
      const nameB = (b.name || `${b.first_name ?? ''} ${b.last_name ?? ''}`).trim().toLowerCase()
      return nameA.localeCompare(nameB)
    })
  } else if (sortOrder.value === 'name-desc') {
    filtered.sort((a: any, b: any) => {
      const nameA = (a.name || `${a.first_name ?? ''} ${a.last_name ?? ''}`).trim().toLowerCase()
      const nameB = (b.name || `${b.first_name ?? ''} ${b.last_name ?? ''}`).trim().toLowerCase()
      return nameB.localeCompare(nameA)
    })
  }

  return filtered
})

const isFiltersDirty = computed(() => {
  return searchQuery.value !== '' ||
         categoryFilter.value !== 'all' ||
         paymentFilter.value !== 'all' ||
         sortOrder.value !== 'newest'
})

function resetFilters() {
  searchQuery.value = ''
  categoryFilter.value = 'all'
  paymentFilter.value = 'all'
  sortOrder.value = 'newest'
  currentPage.value = 1
}

const totalPages = computed(() => Math.ceil(filteredInscriptions.value.length / pageSize.value))

const paginatedInscriptions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredInscriptions.value.slice(start, end)
})

const pageRange = computed(() => {
  const current = currentPage.value
  const total = totalPages.value
  const maxButtons = 5
  
  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  
  const half = Math.floor(maxButtons / 2)
  let start = current - half
  let end = current + half
  
  if (start <= 0) {
    start = 1
    end = maxButtons
  } else if (end > total) {
    end = total
    start = total - maxButtons + 1
  }
  
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

const paginationStart = computed(() => {
  if (filteredInscriptions.value.length === 0) return 0
  return (currentPage.value - 1) * pageSize.value + 1
})

const paginationEnd = computed(() => {
  return Math.min(currentPage.value * pageSize.value, filteredInscriptions.value.length)
})

// Reset to page 1 on filter/search change
watch([searchQuery, categoryFilter, paymentFilter, pageSize], () => {
  currentPage.value = 1
})

// Stats
const totalInscriptions = computed(() => participants.value?.length ?? 0)
const last7d = computed(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  return (participants.value ?? []).filter((p: any) => new Date(p.created_at).getTime() >= cutoff).length
})

const byCategory = computed(() => {
  const m: Record<string, number> = {}
  for (const p of participants.value ?? []) {
    m[p.category_id] = (m[p.category_id] || 0) + 1
  }
  return m
})

// ── Registration URL + toggle open ───────────────────────────────────────────
const registrationUrl = computed(() => {
  const token = (currentContest.value as any)?.registration_token
  if (!token) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/join/${token}`
})

const copiedLink = ref(false)
async function copyLink() {
  if (!registrationUrl.value) return
  try {
    await navigator.clipboard.writeText(registrationUrl.value)
    copiedLink.value = true
    toast.success('Enlace copiado')
    setTimeout(() => { copiedLink.value = false }, 1500)
  } catch { toast.error('No se pudo copiar') }
}

const togglingOpen = ref(false)
async function toggleRegistration() {
  if (!currentContest.value) return
  togglingOpen.value = true
  try {
    const next = !(currentContest.value as any).registration_open
    await contestStore.updateContest({ registration_open: next } as any)
    toast.success(next ? 'Inscripciones abiertas' : 'Inscripciones cerradas')
  } catch { toast.error('Error al cambiar estado') }
  finally { togglingOpen.value = false }
}

// ── Delete ──────────────────────────────────────────────────────────────────
async function removeParticipant(id: string) {
  try {
    await contestStore.deleteParticipant(id)
    toast.success('Inscripción eliminada')
  } catch { toast.error('Error al eliminar') }
}

// ── Refund ──────────────────────────────────────────────────────────────────
const refunding = ref<string | null>(null)
async function refundParticipant(id: string) {
  refunding.value = id
  try {
    const r = await apiClient<any>(`/api/participants/${id}/refund`, { method: 'POST', body: {} })
    toast.success(r?.status === 'refunded' ? 'Reembolso completado' : 'Reembolso parcial completado')
    // Refresh participants
    const cid = currentContest.value?.id
    if (cid) {
      participantsStore.invalidate(cid)
    try { await participantsStore.fetch(cid) } catch (e) { console.error('[inscriptions] fetch failed:', e) }
    }
  } catch (e: any) {
    toast.error(e?.statusMessage || e?.data?.statusMessage || 'Error al reembolsar')
  } finally {
    refunding.value = null
  }
}

// ── CSV export ──────────────────────────────────────────────────────────────
function exportCsv() {
  const rows = filteredInscriptions.value
  if (!rows.length) { toast.error('Nada que exportar'); return }
  const headers = ['fecha', 'nombre', 'apellidos', 'email', 'dni', 'telefono', 'pais', 'categoria', 'fecha_nacimiento']
  const lines = [headers.join(',')]
  for (const p of rows as any[]) {
    const cat = categoryById.value[p.category_id]?.name ?? ''
    const esc = (v: any) => {
      const s = v == null ? '' : String(v)
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    lines.push([
      new Date(p.created_at).toISOString(),
      p.first_name ?? '',
      p.last_name ?? '',
      p.email ?? '',
      p.dni ?? '',
      p.phone ?? '',
      p.country ?? '',
      cat,
      p.birthdate ?? '',
    ].map(esc).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inscripciones-${currentContest.value?.slug ?? 'contest'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

const registrationOpen = computed(() => (currentContest.value as any)?.registration_open !== false)
const contestStatus = computed(() => (currentContest.value as any)?.status as string | undefined)
const contestLocked = computed(() => ['active','finished','cancelled'].includes(contestStatus.value || ''))

// ── Tabs ────────────────────────────────────────────────────────────────────
// The header actions (copy link, CSV, import) only apply to the participant
// list, so they hide while the form builder is on screen.
const activeTab = ref<'participantes' | 'formulario'>('participantes')
</script>

<template>
  <div class="space-y-6 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header -->
    <div class="flex items-start gap-3">
      <NuxtLink
        :to="`/contests/${route.params.slug}`"
        class="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
      >
        <ArrowLeft class="w-4 h-4" />
      </NuxtLink>
      <div class="flex-1 min-w-0">
        <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {{ currentContest?.name || '…' }}
        </p>
        <h1 class="text-2xl font-bold tracking-tight uppercase">Inscripciones</h1>
      </div>

      <div v-show="activeTab === 'participantes'" class="flex items-center gap-2 shrink-0">
        <Button
          v-if="!contestLocked"
          variant="outline"
          size="sm"
          :disabled="togglingOpen"
          class="gap-2 font-bold border-2 uppercase tracking-widest text-[10px]"
          :class="registrationOpen
            ? 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            : 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30'"
          @click="toggleRegistration"
        >
          <Unlock v-if="registrationOpen" class="w-3.5 h-3.5" />
          <Lock v-else class="w-3.5 h-3.5" />
          {{ registrationOpen ? 'Abiertas' : 'Cerradas' }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="gap-2 font-bold border-2 uppercase tracking-widest text-[10px]"
          :disabled="!registrationUrl"
          @click="copyLink"
        >
          <Check v-if="copiedLink" class="w-3.5 h-3.5 text-emerald-500" />
          <Link2 v-else class="w-3.5 h-3.5" />
          {{ copiedLink ? 'Copiado' : 'Copiar enlace' }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="gap-2 font-bold border-2 uppercase tracking-widest text-[10px]"
          @click="exportCsv"
        >
          <Download class="w-3.5 h-3.5" /> CSV
        </Button>
        <Button
          v-if="!contestLocked"
          size="sm"
          class="gap-2 font-bold uppercase tracking-widest text-[10px]"
          @click="openImport"
        >
          <Upload class="w-3.5 h-3.5" /> Importar CSV
        </Button>
      </div>
    </div>

    <Tabs v-model="activeTab" class="w-full">
      <TabsList>
        <TabsTrigger value="participantes">
          Participantes
        </TabsTrigger>
        <TabsTrigger value="formulario">
          Formulario
        </TabsTrigger>
      </TabsList>

      <TabsContent value="participantes" class="space-y-6 mt-6">
    <!-- Locked banner when contest active/finished/cancelled -->
    <div
      v-if="contestLocked"
      class="rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center gap-3"
    >
      <Lock class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <div class="flex-1 text-sm text-amber-800 dark:text-amber-300">
        <strong class="font-bold uppercase tracking-widest text-[10px]">Concurso {{ contestStatus }}</strong>
        — gestión de inscripciones bloqueada. No se pueden añadir, editar ni eliminar participantes.
      </div>
    </div>

    <ImportCsvDialog
      v-if="currentContest"
      :open="importOpen"
      :contest-id="currentContest.id"
      :contest-starts-at="(currentContest as any).starts_at ?? null"
      :categories="(categories ?? []) as any"
      :ticket-balance="ticketBalance"
      @update:open="(v) => (importOpen = v)"
      @imported="onImported"
    />

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card class="border-2">
        <CardContent class="p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total</p>
          <p class="text-2xl font-bold mt-1">{{ totalInscriptions }}</p>
        </CardContent>
      </Card>
      <Card class="border-2">
        <CardContent class="p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Últimos 7 días</p>
          <p class="text-2xl font-bold mt-1">{{ last7d }}</p>
        </CardContent>
      </Card>
      <Card class="border-2">
        <CardContent class="p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Categorías</p>
          <p class="text-2xl font-bold mt-1">{{ categories?.length ?? 0 }}</p>
        </CardContent>
      </Card>
      <Card class="border-2" :class="registrationOpen ? '' : 'border-amber-300 dark:border-amber-700'">
        <CardContent class="p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Estado</p>
          <p class="text-2xl font-bold mt-1" :class="registrationOpen ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
            {{ registrationOpen ? 'Abiertas' : 'Cerradas' }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Filter bar -->
    <div class="flex flex-col gap-4 bg-muted/20 border-2 border-border p-4 rounded-xl shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div class="relative w-full max-w-xs">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input v-model="searchQuery" placeholder="Buscar nombre, email, DNI…" class="pl-9 h-10 border-2 bg-background" />
          </div>
          
          <Select v-model="paymentFilter">
            <SelectTrigger class="h-10 w-[185px] border-2 bg-background font-bold text-xs uppercase tracking-wider">
              <SelectValue placeholder="Estado de pago" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pagos</SelectItem>
              <SelectItem value="paid">Pagados</SelectItem>
              <SelectItem value="free">Gratis / Exentos</SelectItem>
              <SelectItem value="refunded">Reembolsados</SelectItem>
              <SelectItem value="partial_refund">Reembolso parcial</SelectItem>
            </SelectContent>
          </Select>

          <Select v-model="sortOrder">
            <SelectTrigger class="h-10 w-[185px] border-2 bg-background font-bold text-xs uppercase tracking-wider">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Más recientes</SelectItem>
              <SelectItem value="oldest">Más antiguos</SelectItem>
              <SelectItem value="name-asc">Nombre (A-Z)</SelectItem>
              <SelectItem value="name-desc">Nombre (Z-A)</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            v-if="isFiltersDirty" 
            variant="ghost" 
            size="sm" 
            class="h-10 gap-1.5 font-bold uppercase tracking-widest text-[10px] text-zinc-500 hover:text-foreground"
            @click="resetFilters"
          >
            <RotateCcw class="w-3.5 h-3.5" /> Limpiar filtros
          </Button>
        </div>
      </div>

      <!-- Categories Filter Row -->
      <div class="flex flex-wrap gap-1.5 border-t border-border/50 pt-3">
        <button
          type="button"
          class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md border-2 transition-all flex items-center gap-1.5"
          :class="categoryFilter === 'all'
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
            : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'"
          @click="categoryFilter = 'all'"
        >
          Todas <span class="text-[9px] opacity-70">{{ totalInscriptions }}</span>
        </button>
        <button
          v-for="c in categories ?? []"
          :key="c.id"
          type="button"
          class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md border-2 transition-all flex items-center gap-1.5"
          :class="categoryFilter === c.id
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
            : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'"
          @click="categoryFilter = c.id"
        >
          {{ c.name }}
          <span class="text-[9px] opacity-70">
            {{ byCategory[c.id] || 0 }}<template v-if="(c as any).max_participants">/{{ (c as any).max_participants }}</template>
          </span>
        </button>
      </div>
    </div>

    <!-- Table -->
    <div v-if="filteredInscriptions.length" class="space-y-4">
      <div class="border-2 border-border rounded-xl overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fecha</TableHead>
              <TableHead class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Participante</TableHead>
              <TableHead class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Categoría</TableHead>
              <TableHead class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contacto</TableHead>
              <TableHead class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Documento</TableHead>
              <TableHead class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pago</TableHead>
              <TableHead class="text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="p in paginatedInscriptions" :key="p.id" class="group hover:bg-muted/40">
              <TableCell class="text-xs text-muted-foreground whitespace-nowrap">
                <div class="flex items-center gap-1.5">
                  <Calendar class="w-3 h-3" />
                  {{ fmtDate(p.created_at) }}
                </div>
              </TableCell>
              <TableCell>
                <div class="flex flex-col">
                  <span class="font-bold text-sm">{{ p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() }}</span>
                  <span v-if="p.birthdate" class="text-[10px] text-muted-foreground">
                    Nac. {{ new Date(p.birthdate).toLocaleDateString('es-ES') }}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge class="font-bold uppercase text-[9px] tracking-widest border-2 rounded-md bg-muted text-foreground border-border">
                  {{ categoryById[p.category_id]?.name ?? '—' }}
                </Badge>
              </TableCell>
              <TableCell>
                <div class="flex flex-col gap-0.5 text-xs">
                  <span v-if="p.email" class="flex items-center gap-1.5 text-muted-foreground">
                    <Mail class="w-3 h-3" /> {{ p.email }}
                  </span>
                  <span v-if="p.phone" class="flex items-center gap-1.5 text-muted-foreground">
                    <Phone class="w-3 h-3" /> {{ p.phone }}
                  </span>
                  <span v-if="p.country" class="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin class="w-3 h-3" /> {{ p.country }}
                  </span>
                </div>
              </TableCell>
              <TableCell class="text-xs font-mono">{{ p.dni || '—' }}</TableCell>
              <TableCell>
                <div class="flex flex-col gap-0.5">
                  <Badge
                    v-if="p.payment_status === 'paid'"
                    class="font-bold uppercase text-[9px] tracking-widest bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-700 border-2 rounded-md w-fit"
                  >
                    Pagado {{ p.amount_paid_cents ? `· €${(p.amount_paid_cents/100).toFixed(2)}` : '' }}
                  </Badge>
                  <Badge
                    v-else-if="p.payment_status === 'refunded'"
                    class="font-bold uppercase text-[9px] tracking-widest bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 border-2 rounded-md w-fit"
                  >
                    Reembolsado
                  </Badge>
                  <Badge
                    v-else-if="p.payment_status === 'partial_refund'"
                    class="font-bold uppercase text-[9px] tracking-widest bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700 border-2 rounded-md w-fit"
                  >
                    Parcial €{{ (p.amount_refunded_cents/100).toFixed(2) }}
                  </Badge>
                  <Badge
                    v-else
                    variant="outline"
                    class="font-bold uppercase text-[9px] tracking-widest w-fit"
                  >
                    {{ p.payment_status === 'free' || p.payment_status === 'zero' ? 'Gratis' : '—' }}
                  </Badge>
                </div>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <AlertDialog v-if="p.payment_status === 'paid'">
                    <AlertDialogTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8 text-muted-foreground hover:text-amber-600"
                        :disabled="refunding === p.id"
                        title="Reembolsar"
                      >
                        <ArrowLeft class="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reembolsar inscripción</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se reembolsarán €{{ (p.amount_paid_cents/100).toFixed(2) }} a <strong>{{ p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() }}</strong> vía Stripe. La comisión de plataforma también se reembolsará proporcionalmente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction class="bg-amber-600 text-white hover:bg-amber-700" @click="refundParticipant(p.id)">
                          Reembolsar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger as-child>
                      <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 class="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar inscripción</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará a <strong>{{ p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() }}</strong> del concurso. Acción irreversible.
                          <template v-if="p.payment_status === 'paid'">
                            <br /><span class="text-amber-600">Advertencia: esta inscripción está pagada. Considera reembolsar antes de eliminar.</span>
                          </template>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction class="bg-destructive text-white hover:bg-destructive/90" @click="removeParticipant(p.id)">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination Controls -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/10 border-2 border-border p-4 rounded-xl shadow-sm">
        <div class="text-xs text-muted-foreground">
          Mostrando <strong class="text-foreground font-semibold">{{ paginationStart }}</strong> a 
          <strong class="text-foreground font-semibold">{{ paginationEnd }}</strong> de 
          <strong class="text-foreground font-semibold">{{ filteredInscriptions.length }}</strong> inscripciones
          <template v-if="filteredInscriptions.length !== totalInscriptions">
            (filtradas de un total de {{ totalInscriptions }})
          </template>
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <!-- Page size selector -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground whitespace-nowrap">Filas por página</span>
            <Select :model-value="String(pageSize)" @update:model-value="(val) => pageSize = Number(val)">
              <SelectTrigger class="h-8 w-[70px] border-2 bg-background font-bold text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Page buttons -->
          <div class="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              class="h-8 w-8 border-2"
              :disabled="currentPage === 1"
              @click="currentPage--"
            >
              <ChevronLeft class="w-4 h-4" />
            </Button>
            
            <template v-for="page in pageRange" :key="page">
              <Button
                variant="outline"
                size="sm"
                class="h-8 min-w-8 border-2 font-bold text-xs"
                :class="currentPage === page ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : ''"
                @click="currentPage = page"
              >
                {{ page }}
              </Button>
            </template>

            <Button
              variant="outline"
              size="icon"
              class="h-8 w-8 border-2"
              :disabled="currentPage === totalPages"
              @click="currentPage++"
            >
              <ChevronRight class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <Card v-else class="border-2 border-dashed bg-muted/30 py-12">
      <CardContent class="text-center space-y-2">
        <Users class="w-10 h-10 text-muted-foreground/40 mx-auto" />
        <p class="text-sm font-bold text-muted-foreground">
          <template v-if="searchQuery || categoryFilter !== 'all'">Sin resultados con los filtros actuales</template>
          <template v-else>Aún no hay inscripciones</template>
        </p>
        <p class="text-xs text-muted-foreground/70">
          <template v-if="!searchQuery && categoryFilter === 'all'">Comparte el enlace de inscripción para empezar a recibir participantes.</template>
        </p>
      </CardContent>
    </Card>
      </TabsContent>

      <TabsContent value="formulario" class="mt-6">
        <InscriptionFormTab
          v-if="currentContest"
          :contest-id="currentContest.id"
          :locked="contestLocked"
        />
      </TabsContent>
    </Tabs>
  </div>
</template>
