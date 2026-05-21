<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import {
  LayoutDashboard, Trophy, Settings, Users, Wallet, Calendar as CalendarIcon,
  Search, ArrowRight, Folder, User, Sparkles
} from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()
const { isOrgOwner, profile } = storeToRefs(authStore)

const open = ref(false)
const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const activeIdx = ref(0)

// ── Dynamic data ────────────────────────────────────────────────────
const contests = ref<any[]>([])
const categories = ref<any[]>([])
const participants = ref<any[]>([])
const dataLoaded = ref(false)

async function loadData() {
  if (dataLoaded.value) return
  if (!authStore.session?.access_token) return
  try {
    if (isOrgOwner.value) {
      const cs = await $fetch<any[]>('/api/contests', {
        headers: { Authorization: `Bearer ${authStore.session.access_token}` },
      }).catch(() => [])
      contests.value = cs || []
      // Categories + participants pulled per-contest is heavy; piggyback calendar facets
      const cal = await $fetch<any>('/api/calendar', {
        headers: { Authorization: `Bearer ${authStore.session.access_token}` },
      }).catch(() => null)
      if (cal?.facets) {
        categories.value = cal.facets.categories || []
        participants.value = cal.facets.participants || []
      }
    } else {
      const cs = await $fetch<any[]>('/api/my/contests', {
        headers: { Authorization: `Bearer ${authStore.session.access_token}` },
      }).catch(() => [])
      contests.value = cs || []
    }
    dataLoaded.value = true
  } catch (e) { console.error('[command-palette] load failed:', e) }
}

// ── Static nav items ────────────────────────────────────────────────
const navItems = computed(() => {
  const items: any[] = [
    { id: 'nav:dashboard', icon: LayoutDashboard, label: 'Resumen', sub: 'Dashboard', to: '/dashboard', group: 'Navegación' },
    { id: 'nav:settings', icon: Settings, label: 'Configuración', sub: 'Ajustes de cuenta', to: '/settings', group: 'Navegación' },
  ]
  if (isOrgOwner.value) {
    items.push(
      { id: 'nav:contests', icon: Trophy, label: 'Mis Concursos', sub: 'Administrar concursos', to: '/contests', group: 'Navegación' },
      { id: 'nav:judges', icon: Users, label: 'Jurados', sub: 'Pool de jurados', to: '/judge-pool', group: 'Navegación' },
      { id: 'nav:calendar', icon: CalendarIcon, label: 'Calendario', sub: 'Ensayos y actuaciones', to: '/calendar', group: 'Navegación' },
      { id: 'nav:billing', icon: Wallet, label: 'Billing', sub: 'Tickets y facturación', to: '/billing', group: 'Navegación' },
      { id: 'nav:new-contest', icon: Sparkles, label: 'Nuevo concurso', sub: 'Crear concurso', to: '/contests/new', group: 'Acciones' },
    )
  } else if (profile.value) {
    items.push(
      { id: 'nav:my-contests', icon: Trophy, label: 'Mis Concursos', sub: 'Mis participaciones', to: '/my-contests', group: 'Navegación' },
      { id: 'nav:my-calendar', icon: CalendarIcon, label: 'Mi Calendario', sub: 'Ensayos y actuaciones', to: '/my-calendar', group: 'Navegación' }
    )
  }
  return items
})

const dynamicItems = computed(() => {
  const items: any[] = []
  for (const c of contests.value) {
    items.push({
      id: `contest:${c.id}`,
      icon: Trophy,
      label: c.name,
      sub: 'Concurso',
      to: isOrgOwner.value ? `/contests/${c.slug}` : `/my-contests/${c.slug}`,
      group: 'Concursos',
    })
  }
  for (const cat of categories.value) {
    const c = contests.value.find((x: any) => x.id === cat.contest_id)
    if (!c) continue
    items.push({
      id: `cat:${cat.id}`,
      icon: Folder,
      label: cat.name,
      sub: c.name,
      to: `/contests/${c.slug}/categories/${cat.id}`,
      group: 'Categorías',
    })
  }
  for (const p of participants.value) {
    const c = contests.value.find((x: any) => x.id === p.contest_id)
    items.push({
      id: `part:${p.id}`,
      icon: User,
      label: p.name,
      sub: c?.name || 'Participante',
      to: c ? `/contests/${c.slug}` : '/contests',
      group: 'Participantes',
    })
  }
  return items
})

const allItems = computed(() => [...navItems.value, ...dynamicItems.value])

// ── Filter ──────────────────────────────────────────────────────────
function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

const filtered = computed(() => {
  const q = normalize(query.value.trim())
  if (!q) return allItems.value.slice(0, 30)
  return allItems.value
    .filter((it: any) => normalize(`${it.label} ${it.sub || ''}`).includes(q))
    .slice(0, 30)
})

const grouped = computed(() => {
  const map = new Map<string, any[]>()
  for (const it of filtered.value) {
    if (!map.has(it.group)) map.set(it.group, [])
    map.get(it.group)!.push(it)
  }
  // Flat ordered list with group headers
  const out: Array<{ type: 'header' | 'item'; group?: string; item?: any; flatIdx?: number }> = []
  let flatIdx = 0
  for (const [group, items] of map.entries()) {
    out.push({ type: 'header', group })
    for (const it of items) {
      out.push({ type: 'item', item: it, flatIdx: flatIdx++ })
    }
  }
  return out
})

const flatItems = computed(() => filtered.value)

watch(filtered, () => { activeIdx.value = 0 })

// ── Keyboard ────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = !open.value
    return
  }
  if (!open.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, flatItems.value.length - 1)
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const it = flatItems.value[activeIdx.value]
    if (it) selectItem(it)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = document.querySelector('[data-cmdk-active="true"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function selectItem(it: any) {
  open.value = false
  query.value = ''
  router.push(it.to)
}

watch(open, async (v) => {
  if (v) {
    await loadData()
    await nextTick()
    inputRef.value?.focus()
    activeIdx.value = 0
  } else {
    query.value = ''
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Expose open trigger for parent
defineExpose({ open: () => { open.value = true } })
const isMac = computed(() => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform))
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="p-0 max-w-2xl overflow-hidden gap-0" hide-close>
      <DialogTitle class="sr-only">Búsqueda global</DialogTitle>
      <DialogDescription class="sr-only">Busca concursos, categorías, participantes y navega rápido</DialogDescription>
      <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Search class="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="Buscar concursos, categorías, participantes..."
          class="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
        <kbd class="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
          ESC
        </kbd>
      </div>

      <div class="max-h-[420px] overflow-y-auto py-2">
        <div v-if="!flatItems.length" class="px-4 py-12 text-center text-sm text-muted-foreground">
          Sin resultados
        </div>
        <template v-for="(row, i) in grouped" :key="i">
          <div
            v-if="row.type === 'header'"
            class="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
          >
            {{ row.group }}
          </div>
          <button
            v-else
            type="button"
            :data-cmdk-active="activeIdx === row.flatIdx"
            class="w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
            :class="activeIdx === row.flatIdx
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'"
            @click="selectItem(row.item)"
            @mouseenter="activeIdx = row.flatIdx ?? 0"
          >
            <component :is="row.item.icon" class="w-4 h-4 shrink-0 text-muted-foreground" />
            <div class="flex-1 min-w-0">
              <div class="truncate">{{ row.item.label }}</div>
              <div v-if="row.item.sub" class="text-[11px] text-muted-foreground truncate">{{ row.item.sub }}</div>
            </div>
            <ArrowRight class="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
          </button>
        </template>
      </div>

      <div class="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1"><kbd class="bg-background border border-border px-1 rounded">↑↓</kbd> navegar</span>
          <span class="flex items-center gap-1"><kbd class="bg-background border border-border px-1 rounded">↵</kbd> abrir</span>
        </div>
        <span class="flex items-center gap-1">
          <kbd class="bg-background border border-border px-1 rounded">{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
          <kbd class="bg-background border border-border px-1 rounded">K</kbd>
        </span>
      </div>
    </DialogContent>
  </Dialog>
</template>
