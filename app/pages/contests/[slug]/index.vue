<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Users, ListTree, Activity, Calendar, CalendarClock, Settings2, Trophy, Swords, CalendarRange, Zap, Lock, Search, ChevronRight, Grid3x3, List, Link2, Check, Play, Loader2, Trash2, Pencil, Save } from 'lucide-vue-next'
import RichEditor from '@/components/ui/rich-editor/RichEditor.vue'
import { marked } from 'marked'
import { toast } from 'vue-sonner'
import CreateCategoryDialog from '~/components/contest/CreateCategoryDialog.vue'
import EditContestDrawer from '~/components/contest/EditContestDrawer.vue'
import { Input } from '@/components/ui/input'
import { useContestStore } from '@/stores/contest'
import { storeToRefs } from 'pinia'
import { getStatusClasses, getTypeClasses, getModeClasses, getTierClasses, getStatusBannerClasses, getTypeBannerClasses, getModeBannerClasses } from '@/utils/styles'

const route = useRoute()
const contestStore = useContestStore()
const { currentContest, categories, participants, rounds } = storeToRefs(contestStore)

await contestStore.fetchContest(route.params.slug as string)

// State management for Edit Drawer
const isDrawerOpen = ref(false)
const activeTab = ref('categorias')

const getParticipantsCount = (categoryId: string) => {
  return participants.value?.filter(p => p.category_id === categoryId).length || 0
}

const formatDate = (date: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!date) return 'Sin fecha'
  return new Date(date).toLocaleDateString('es-ES', options)
}

const contestSettings = computed(() => {
  const s = currentContest.value?.settings as any
  return {
    mode: s?.mode || 'standard',
    rounds_count: s?.rounds_count || 1
  }
})

const DEFAULT_COVER = 'https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/default-cover.png'
const coverImage = computed(() => currentContest.value?.cover_image_url || DEFAULT_COVER)

const parsedDescription = computed(() => marked.parse(currentContest.value?.description || '') as string)
const parsedRules = computed(() => marked.parse((currentContest.value?.settings as any)?.rules || '') as string)

// ── Activate contest (draft → active) ────────────────────────────────────────
const activating = ref(false)
async function activateContest() {
  const c = currentContest.value as any
  if (!c) return
  if (!confirm('¿Iniciar el concurso? Se consumirá 1 activación. Los participantes podrán empezar a competir.')) return
  activating.value = true
  try {
    await contestStore.updateContest({ status: 'active' } as any)
    toast.success('Concurso iniciado')
  } catch (e: any) {
    toast.error(e?.statusMessage || e?.data?.statusMessage || 'Error al iniciar')
  } finally {
    activating.value = false
  }
}

// ── Copy inscription link ────────────────────────────────────────────────────
const copiedLink = ref(false)
async function copyInscriptionLink() {
  const token = (currentContest.value as any)?.registration_token
  if (!token) { toast.error('Token no disponible'); return }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/join/${token}`
  try {
    await navigator.clipboard.writeText(url)
    copiedLink.value = true
    toast.success('Enlace de inscripción copiado')
    setTimeout(() => { copiedLink.value = false }, 1500)
  } catch {
    toast.error('No se pudo copiar')
  }
}

// ── Categories filter ────────────────────────────────────────────────────────
const searchQuery = ref('')
const statusFilter = ref<'all' | 'pending' | 'active' | 'closed'>('all')
const viewMode = ref<'list' | 'grid'>('list')

const filteredCategories = computed(() => {
  const list = categories.value ?? []
  const q = searchQuery.value.trim().toLowerCase()
  return list.filter(c => {
    if (statusFilter.value !== 'all' && c.status !== statusFilter.value) return false
    if (q && !c.name.toLowerCase().includes(q) && !(c.description || '').toLowerCase().includes(q)) return false
    return true
  })
})

const statusCounts = computed(() => {
  const base = { all: 0, pending: 0, active: 0, closed: 0 }
  for (const c of categories.value ?? []) {
    base.all++
    base[c.status as 'pending' | 'active' | 'closed']++
  }
  return base
})

const statusChipClasses = (status: 'all' | 'pending' | 'active' | 'closed') => {
  const active = statusFilter.value === status
  return active
    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
    : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
}

const categoryStatusLabel = (s: string) => ({ pending: 'Pendiente', active: 'Activa', closed: 'Cerrada' }[s] ?? s)
const categoryStatusBadge = (s: string) => ({
  pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-500/30',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-500/30',
  closed: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700',
}[s] ?? '')

const canDeleteCategory = computed(() => {
  const s = currentContest.value?.status
  // Backend permits draft + active. finished/cancelled blocked + rounds-not-pending blocked.
  return s === 'draft' || s === 'active'
})

const deletingCategoryId = ref<string | null>(null)

// ── Inline edit: description ─────────────────────────────────────────────────
const editingDescription = ref(false)
const descriptionDraft = ref('')

function startEditDescription() {
  const raw = currentContest.value?.description || ''
  descriptionDraft.value = raw.startsWith('<') ? raw : marked.parse(raw) as string
  editingDescription.value = true
}

async function saveDescription() {
  try {
    await contestStore.updateContest({ description: descriptionDraft.value || null } as any)
    toast.success('Descripción actualizada')
    editingDescription.value = false
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'Error al guardar')
  }
}

// ── Inline edit: rules ───────────────────────────────────────────────────────
const editingRules = ref(false)
const rulesDraft = ref('')

function startEditRules() {
  const raw = (currentContest.value?.settings as any)?.rules || ''
  rulesDraft.value = raw.startsWith('<') ? raw : marked.parse(raw) as string
  editingRules.value = true
}

async function saveRules() {
  try {
    const existingSettings = (currentContest.value?.settings as any) || {}
    await contestStore.updateContest({
      settings: { ...existingSettings, rules: rulesDraft.value || null }
    } as any)
    toast.success('Reglamento actualizado')
    editingRules.value = false
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'Error al guardar')
  }
}

async function handleDeleteCategory(catId: string, catName: string) {
  if (!confirm(`¿Eliminar la categoría "${catName}"? Se eliminarán todas las rondas y participantes asociados.`)) return
  deletingCategoryId.value = catId
  try {
    await contestStore.deleteCategory(catId)
    toast.success('Categoría eliminada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.statusMessage || 'Error al eliminar la categoría')
  } finally {
    deletingCategoryId.value = null
  }
}
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1400px] mx-auto">
    <!-- Banner -->
    <div
      class="relative w-full h-56 md:h-72 rounded-2xl overflow-hidden border-2 border-border shadow-sm bg-muted bg-center bg-cover"
      :style="`background-image: url('${coverImage}')`"
    >
      <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/50"></div>

      <!-- Top bar: badges + meta + configurar -->
      <div v-if="currentContest" class="absolute top-0 left-0 right-0 p-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">
          <Badge
            class="capitalize px-3 py-1 font-bold tracking-tight shadow-sm border-2 rounded-md backdrop-blur-sm"
            :class="getStatusBannerClasses(currentContest.status)"
          >
            <Activity class="w-3.5 h-3.5 mr-1.5" />
            {{ currentContest.status === 'draft' ? 'Borrador' : currentContest.status }}
          </Badge>

          <Badge
            variant="outline"
            class="capitalize px-3 py-1 font-semibold border-2 rounded-md backdrop-blur-sm"
            :class="getTypeBannerClasses(currentContest.type)"
          >
            <Trophy class="w-3.5 h-3.5 mr-1.5" />
            {{ currentContest.type }}
          </Badge>

          <Badge
            variant="outline"
            class="capitalize px-3 py-1 font-bold italic transition-all gap-1.5 border-2 rounded-md backdrop-blur-sm"
            :class="getModeBannerClasses(contestSettings.mode)"
          >
            <component :is="contestSettings.mode === 'tournament' ? Swords : CalendarRange" class="w-3.5 h-3.5" />
            {{ contestSettings.mode === 'tournament' ? 'Torneo' : 'Estándar' }}
          </Badge>

          <Badge
            v-if="contestSettings.mode === 'standard'"
            variant="secondary"
            class="px-3 py-1 font-bold text-[9px] uppercase tracking-widest border-2 gap-1 shadow-sm rounded-md bg-white/90 backdrop-blur-sm"
            :class="getTierClasses(currentContest.is_rounds_dynamic)"
          >
            <component :is="currentContest.is_rounds_dynamic ? Zap : Lock" class="w-2.5 h-2.5" />
            {{ currentContest.is_rounds_dynamic ? 'Dinámico' : 'Fijo' }}
          </Badge>
        </div>

        <div class="flex items-center gap-4">
          <NuxtLink :to="`/contests/${route.params.slug}/inscriptions`">
            <Button
              variant="outline"
              size="sm"
              class="gap-2 bg-white/90 backdrop-blur-sm text-zinc-900 border-white hover:bg-white dark:bg-white/10 dark:text-zinc-100 dark:border-white/20 dark:hover:bg-white/20 font-bold border-2 rounded-md transition-all uppercase tracking-tighter text-[10px]"
            >
              <Users class="w-4 h-4" /> Inscripciones
              <Badge v-if="participants?.length" class="ml-1 h-4 px-1.5 text-[9px] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-0 font-bold">
                {{ participants.length }}
              </Badge>
            </Button>
          </NuxtLink>

          <Button
            v-if="(currentContest as any)?.registration_open"
            variant="outline"
            size="sm"
            class="gap-2 bg-white/90 backdrop-blur-sm text-zinc-900 border-white hover:bg-white dark:bg-white/10 dark:text-zinc-100 dark:border-white/20 dark:hover:bg-white/20 font-bold border-2 rounded-md transition-all uppercase tracking-tighter text-[10px]"
            @click="copyInscriptionLink"
          >
            <Check v-if="copiedLink" class="w-4 h-4 text-emerald-500" />
            <Link2 v-else class="w-4 h-4" />
            {{ copiedLink ? 'Copiado' : 'Enlace' }}
          </Button>

          <Button
            v-if="currentContest?.status === 'draft'"
            size="sm"
            class="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 font-bold border-2 rounded-md transition-all uppercase tracking-tighter text-[10px]"
            :disabled="activating"
            @click="activateContest"
          >
            <Loader2 v-if="activating" class="w-4 h-4 animate-spin" />
            <Play v-else class="w-4 h-4" />
            {{ activating ? 'Iniciando…' : 'Iniciar concurso' }}
          </Button>

          <Button
            variant="outline"
            size="sm"
            class="gap-2 bg-white/90 backdrop-blur-sm text-zinc-900 border-white hover:bg-white dark:bg-white/10 dark:text-zinc-100 dark:border-white/20 dark:hover:bg-white/20 font-bold border-2 rounded-md transition-all uppercase tracking-tighter text-[10px]"
            @click="isDrawerOpen = true"
          >
            <Settings2 class="w-4 h-4" /> Configurar
          </Button>
        </div>
      </div>

      <!-- Bottom: title + back + description + dates -->
      <div class="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-3">
        <NuxtLink to="/contests" class="p-1 rounded-md hover:bg-white/10 transition-colors shrink-0">
          <ArrowLeft class="w-4 h-4 text-white drop-shadow-md" />
        </NuxtLink>
        <div class="flex-1 min-w-0">
          <h1 class="text-2xl md:text-4xl font-bold tracking-tight uppercase text-white drop-shadow-md">
            {{ currentContest?.name || 'Cargando...' }}
          </h1>
        </div>
        <div class="hidden lg:flex flex-col items-end gap-1.5 text-[11px] text-white/90 uppercase font-bold tracking-tighter drop-shadow shrink-0">
          <div class="flex items-center gap-1.5">
            <CalendarClock class="w-3.5 h-3.5" />
            <span class="opacity-80">Creado:</span>
            <span>{{ formatDate(currentContest.created_at) }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <Calendar class="w-3.5 h-3.5" />
            <span class="opacity-80">Duración:</span>
            <span>{{ formatDate(currentContest.starts_at, { day: '2-digit', month: '2-digit', year: 'numeric' }) }} - {{ formatDate(currentContest.ends_at, { day: '2-digit', month: '2-digit', year: 'numeric' }) }}</span>
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
      <div class="flex flex-wrap justify-between items-end gap-4 border-b border-border pb-4">
        <div>
          <h2 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <ListTree class="w-6 h-6 text-zinc-500" />
            Categorías
          </h2>
          <p class="text-sm text-muted-foreground mt-1">
            Gestiona las <span class="font-bold text-zinc-900 dark:text-zinc-100">{{ categories?.length || 0 }}</span> categorías y sus <span class="font-bold text-zinc-900 dark:text-zinc-100">{{ participants?.length || 0 }}</span> participantes.
          </p>
        </div>
        <CreateCategoryDialog />
      </div>

      <!-- Filter bar -->
      <div v-if="categories?.length" class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div class="relative flex-1 max-w-sm">
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
              {{ s === 'all' ? 'Todas' : categoryStatusLabel(s) }}
              <span class="text-[9px] opacity-70">{{ statusCounts[s] }}</span>
            </button>
          </div>
        </div>
        <div class="flex p-1 bg-muted rounded-lg border-2 border-border">
          <button
            type="button"
            class="px-2.5 py-1 rounded-md transition-all"
            :class="viewMode === 'list' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="viewMode = 'list'"
          >
            <List class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md transition-all"
            :class="viewMode === 'grid' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="viewMode = 'grid'"
          >
            <Grid3x3 class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- List view -->
      <div v-if="categories?.length && viewMode === 'list' && filteredCategories.length" class="border-2 border-border rounded-xl overflow-hidden bg-card divide-y divide-border">
        <div
          v-for="cat in filteredCategories"
          :key="cat.id"
          class="group flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          <NuxtLink
            :to="`/contests/${currentContest?.slug}/categories/${cat.id}`"
            class="flex items-center gap-4 flex-1 min-w-0"
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
                  {{ categoryStatusLabel(cat.status) }}
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground truncate mt-0.5">
                {{ cat.description || 'Sin descripción' }}
              </p>
            </div>
            <div class="hidden md:flex items-center gap-4 text-[11px] uppercase font-bold tracking-tight text-muted-foreground shrink-0">
              <div class="flex items-center gap-1.5">
                <Users class="w-3.5 h-3.5" />
                <span>{{ getParticipantsCount(cat.id) }}</span>
                <span class="opacity-60">part.</span>
              </div>
              <Badge
                v-if="currentContest?.is_rounds_dynamic"
                class="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-500/30 text-[9px] h-5 border-2 rounded-md font-bold px-2"
              >DINÁMICO</Badge>
              <Badge
                v-else
                class="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-500/30 text-[9px] h-5 border-2 rounded-md font-bold px-2"
              >FIJO</Badge>
            </div>
            <ChevronRight class="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all shrink-0" />
          </NuxtLink>
          <Button
            v-if="canDeleteCategory"
            size="icon"
            variant="ghost"
            class="h-8 w-8 shrink-0 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
            :disabled="deletingCategoryId === cat.id"
            @click.stop="handleDeleteCategory(cat.id, cat.name)"
          >
            <Loader2 v-if="deletingCategoryId === cat.id" class="w-4 h-4 animate-spin" />
            <Trash2 v-else class="w-4 h-4" />
          </Button>
        </div>
      </div>

      <!-- Grid view -->
      <div v-else-if="categories?.length && viewMode === 'grid' && filteredCategories.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
        <div
          v-for="cat in filteredCategories"
          :key="cat.id"
          class="relative group/card"
        >
          <NuxtLink :to="`/contests/${currentContest?.slug}/categories/${cat.id}`">
            <Card class="group shadow-sm border-border hover:border-zinc-700 transition-all cursor-pointer overflow-hidden relative bg-card">
              <CardHeader class="p-6">
                <div class="flex justify-between items-start mb-6">
                  <div class="p-3 bg-muted rounded-xl group-hover:bg-zinc-900 group-hover:text-white transition-all duration-300 shadow-sm">
                    <ListTree class="w-6 h-6" />
                  </div>
                  <div class="flex flex-col items-end gap-2">
                    <Badge
                      class="text-[9px] font-bold uppercase tracking-widest border-2 rounded-md"
                      :class="categoryStatusBadge(cat.status)"
                    >
                      {{ categoryStatusLabel(cat.status) }}
                    </Badge>
                    <Badge variant="secondary" class="bg-muted text-zinc-700 border-border dark:bg-muted dark:text-zinc-400 font-bold px-2.5 py-1 text-[10px] border-2 rounded-md tracking-tight">
                      {{ getParticipantsCount(cat.id) }} PARTICIPANTES
                    </Badge>
                  </div>
                </div>
                <div class="space-y-1">
                  <CardTitle class="text-xl font-bold group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{{ cat.name }}</CardTitle>
                  <CardDescription class="line-clamp-2 min-h-[40px]">{{ cat.description || 'Sin descripción adicional para esta categoría.' }}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </NuxtLink>
          <Button
            v-if="canDeleteCategory"
            size="icon"
            variant="ghost"
            class="absolute top-3 right-3 h-8 w-8 opacity-0 group-hover/card:opacity-100 transition-opacity text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 z-10"
            :disabled="deletingCategoryId === cat.id"
            @click.stop="handleDeleteCategory(cat.id, cat.name)"
          >
            <Loader2 v-if="deletingCategoryId === cat.id" class="w-4 h-4 animate-spin" />
            <Trash2 v-else class="w-4 h-4" />
          </Button>
        </div>
      </div>

      <!-- No results from filter -->
      <div v-else-if="categories?.length && !filteredCategories.length" class="rounded-xl border-2 border-dashed border-border bg-muted/30 py-10 text-center">
        <Search class="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p class="text-sm font-bold text-muted-foreground">Sin resultados</p>
        <p class="text-xs text-muted-foreground/70 mt-1">Ajusta los filtros o limpia la búsqueda.</p>
      </div>

      <!-- Empty state -->
      <Card v-else class="border-2 border-border border-dashed bg-muted/30 h-72 flex items-center justify-center rounded-2xl">
        <CardContent class="flex flex-col items-center justify-center text-center p-0">
          <div class="w-20 h-20 rounded-full bg-card shadow-md border border-border flex items-center justify-center mb-6">
            <ListTree class="w-10 h-10 text-zinc-200" />
          </div>
          <h4 class="font-bold text-2xl text-zinc-900 dark:text-zinc-100 tracking-tight">Crea tu primera categoría</h4>
          <p class="text-zinc-500 text-sm mt-2 max-w-xs px-4">Divide tu concurso en grupos para organizar mejor a los participantes.</p>
          <div class="mt-8">
            <CreateCategoryDialog />
          </div>
        </CardContent>
      </Card>
    </div>
      </TabsContent>

      <!-- Descripción tab -->
      <TabsContent value="descripcion" class="mt-0 pt-6 pb-4">
        <div v-if="!editingDescription" class="relative min-h-[3rem]">
          <Button variant="outline" size="sm" class="absolute top-0 right-0 gap-1.5 text-xs border-2" @click="startEditDescription">
            <Pencil class="w-3.5 h-3.5" /> Editar
          </Button>
          <div
            v-if="currentContest?.description"
            class="rich-content text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed pr-24"
            v-html="parsedDescription"
          />
          <div v-else class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <ListTree class="w-6 h-6 text-zinc-400" />
            </div>
            <p class="text-sm font-medium text-zinc-500">Sin descripción</p>
            <p class="text-xs text-zinc-400 mt-1">Haz clic en Editar para añadir una descripción.</p>
          </div>
        </div>
        <div v-else class="space-y-3">
          <RichEditor v-model="descriptionDraft" placeholder="Cuenta de qué trata este concurso..." min-height="220px" />
          <div class="flex justify-end gap-2">
            <Button variant="outline" size="sm" class="border-2" @click="editingDescription = false">Cancelar</Button>
            <Button size="sm" class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-2 border-border gap-1.5" @click="saveDescription">
              <Save class="w-3.5 h-3.5" /> Guardar
            </Button>
          </div>
        </div>
      </TabsContent>

      <!-- Reglamento tab -->
      <TabsContent value="reglamento" class="mt-0 pt-6 pb-4">
        <div v-if="!editingRules" class="relative min-h-[3rem]">
          <Button variant="outline" size="sm" class="absolute top-0 right-0 gap-1.5 text-xs border-2" @click="startEditRules">
            <Pencil class="w-3.5 h-3.5" /> Editar
          </Button>
          <div
            v-if="(currentContest?.settings as any)?.rules"
            class="rich-content text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed pr-24"
            v-html="parsedRules"
          />
          <div v-else class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <ListTree class="w-6 h-6 text-zinc-400" />
            </div>
            <p class="text-sm font-medium text-zinc-500">Sin reglamento publicado</p>
            <p class="text-xs text-zinc-400 mt-1">Haz clic en Editar para añadir el reglamento.</p>
          </div>
        </div>
        <div v-else class="space-y-3">
          <RichEditor v-model="rulesDraft" placeholder="Normas de participación, criterios de evaluación..." min-height="220px" />
          <div class="flex justify-end gap-2">
            <Button variant="outline" size="sm" class="border-2" @click="editingRules = false">Cancelar</Button>
            <Button size="sm" class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-2 border-border gap-1.5" @click="saveRules">
              <Save class="w-3.5 h-3.5" /> Guardar
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <!-- Edit Drawer Component -->
    <EditContestDrawer
      v-if="currentContest"
      v-model:open="isDrawerOpen" 
      :contest="currentContest" 
    />
  </div>
</template>