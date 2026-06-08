<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { ChevronLeft, ChevronRight, Search, CalendarDays } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

const authStore = useAuthStore()

// ── Config ────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month'
const view = ref<ViewMode>('month')

const HOUR_START = 0
const HOUR_END = 24
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const SLOT_HEIGHT = 56
const DEFAULT_DURATION_MIN = 45

// ── Cursor ───────────────────────────────────────────────────────
const today = new Date()
const cursor = ref(new Date(today.getFullYear(), today.getMonth(), today.getDate()))

// ── Date helpers ─────────────────────────────────────────────────
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function startOfGrid(d: Date) {
  const f = startOfMonth(d)
  const dow = (f.getDay() + 6) % 7
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() - dow)
}
function endOfGrid(d: Date) {
  const e = endOfMonth(d)
  const dow = (e.getDay() + 6) % 7
  return new Date(e.getFullYear(), e.getMonth(), e.getDate() + (6 - dow))
}
function startOfWeek(d: Date) {
  const dow = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d)
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59)
}
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function endOfDay(d: Date)   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59) }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

// ── Range per view ───────────────────────────────────────────────
const range = computed(() => {
  if (view.value === 'month') return { from: startOfGrid(cursor.value), to: endOfGrid(cursor.value) }
  if (view.value === 'week')  return { from: startOfWeek(cursor.value),  to: endOfWeek(cursor.value)  }
  return { from: startOfDay(cursor.value), to: endOfDay(cursor.value) }
})

const monthGridDays = computed(() => {
  const out: Date[] = []
  const d = new Date(range.value.from)
  while (d <= range.value.to) {
    out.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return out
})

const weekDays = computed(() => {
  const start = startOfWeek(cursor.value)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
})

const headerLabel = computed(() => {
  if (view.value === 'month') {
    return cursor.value.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  }
  if (view.value === 'week') {
    const a = startOfWeek(cursor.value)
    const b = addDays(a, 6)
    const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return `${fmt(a)} – ${fmt(b)}, ${b.getFullYear()}`
  }
  return cursor.value.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
})

function prev() {
  if (view.value === 'month') cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() - 1, 1)
  else if (view.value === 'week') cursor.value = addDays(cursor.value, -7)
  else cursor.value = addDays(cursor.value, -1)
}
function next() {
  if (view.value === 'month') cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 1, 1)
  else if (view.value === 'week') cursor.value = addDays(cursor.value, 7)
  else cursor.value = addDays(cursor.value, 1)
}
function goToday() { cursor.value = new Date(today.getFullYear(), today.getMonth(), today.getDate()) }
function goToDay(d: Date) { cursor.value = new Date(d); view.value = 'day' }

// ── Filters ──────────────────────────────────────────────────────
const filterContest = ref<string>('all')
const filterType = ref<'all' | 'rehearsal' | 'performance'>('all')
const search = ref('')

// ── Fetch ────────────────────────────────────────────────────────
const queryKey = computed(() => ({
  from: range.value.from.toISOString(),
  to: range.value.to.toISOString(),
  contest_id: filterContest.value !== 'all' ? filterContest.value : undefined,
  type: filterType.value !== 'all' ? filterType.value : undefined,
}))

const { data, pending } = useFetch<any>('/api/my/calendar', {
  server: false,
  lazy: true,
  query: queryKey,
  headers: computed(() => ({
    Authorization: `Bearer ${authStore.session?.access_token ?? ''}`
  })),
  watch: [computed(() => authStore.session?.access_token)],
})

const events = computed<any[]>(() => (data.value?.events ?? []))
const facets = computed<any>(() => (data.value?.facets ?? { contests: [], categories: [] }))

const filteredEvents = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return events.value
  return events.value.filter((e: any) =>
    (e.title || '').toLowerCase().includes(q) ||
    (e.subtitle || '').toLowerCase().includes(q) ||
    (e.contest_name || '').toLowerCase().includes(q) ||
    (e.category_name || '').toLowerCase().includes(q) ||
    (e.location || '').toLowerCase().includes(q)
  )
})

// ── Group by day ─────────────────────────────────────────────────
const eventsByDay = computed(() => {
  const m = new Map<string, any[]>()
  for (const e of filteredEvents.value) {
    const d = new Date(e.scheduled_at)
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(e)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  }
  return m
})
function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
function dayEvents(d: Date) { return eventsByDay.value.get(dayKey(d)) || [] }

// ── Time grid positioning helpers ────────────────────────────────
function eventTopPx(e: any): number {
  const d = new Date(e.scheduled_at)
  const minutesFromStart = (d.getHours() - HOUR_START) * 60 + d.getMinutes()
  return Math.max(0, (minutesFromStart / 60) * SLOT_HEIGHT)
}
function eventHeightPx(_e: any): number {
  return Math.max(28, (DEFAULT_DURATION_MIN / 60) * SLOT_HEIGHT)
}
function eventEndLabel(e: any): string {
  const d = new Date(e.scheduled_at)
  const end = new Date(d.getTime() + DEFAULT_DURATION_MIN * 60_000)
  return end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ── Scroll refs + auto-scroll ────────────────────────────────────
const weekScrollRef = ref<HTMLElement | null>(null)
const dayScrollRef  = ref<HTMLElement | null>(null)

function scrollToFocusHour() {
  const target = (view.value === 'week' ? weekScrollRef : dayScrollRef).value
  if (!target) return
  const list = view.value === 'week'
    ? weekDays.value.flatMap(d => dayEvents(d))
    : dayEvents(cursor.value)
  let hour: number
  if (list.length) {
    const earliest = list.reduce((a, b) =>
      new Date(a.scheduled_at).getTime() < new Date(b.scheduled_at).getTime() ? a : b
    )
    hour = new Date(earliest.scheduled_at).getHours()
  } else {
    hour = sameDay(cursor.value, today) ? today.getHours() : 8
  }
  const top = Math.max(0, (hour - HOUR_START) * SLOT_HEIGHT - SLOT_HEIGHT)
  target.scrollTo({ top, behavior: 'smooth' })
}

watch([view, cursor, events], () => {
  nextTick(() => scrollToFocusHour())
}, { flush: 'post' })
onMounted(() => nextTick(() => scrollToFocusHour()))

// ── UI helpers ───────────────────────────────────────────────────
const selectedEvent = ref<any | null>(null)
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function eventClasses(type: string, isJudgeView?: boolean) {
  if (isJudgeView) {
    return 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border-l-2 border-blue-500'
  }
  if (type === 'rehearsal') {
    return 'bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-200 border-l-2 border-violet-500'
  }
  return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-l-2 border-emerald-500'
}
function eventDot(type: string, isJudgeView?: boolean) {
  if (isJudgeView) return 'bg-blue-500'
  return type === 'rehearsal' ? 'bg-violet-500' : 'bg-emerald-500'
}

const totalEvents = computed(() => filteredEvents.value.length)
const rehearsalCount = computed(() => filteredEvents.value.filter((e: any) => e.type === 'rehearsal').length)
const performanceCount = computed(() => filteredEvents.value.filter((e: any) => e.type === 'performance').length)

function hourLabel(h: number) {
  const date = new Date()
  date.setHours(h, 0, 0, 0)
  return date.toLocaleTimeString('es-ES', { hour: 'numeric' })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Mi Calendario</h1>
        <p class="text-sm text-muted-foreground">Tus ensayos y actuaciones programados.</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input v-model="search" placeholder="Buscar evento..." class="pl-9 h-9 w-56" />
        </div>
      </div>
    </div>

    <!-- Filters -->
    <Card class="p-4 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950/50">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1.5">
          <button
            v-for="t in (['all','rehearsal','performance'] as const)"
            :key="t"
            type="button"
            class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md border-2 transition-all flex items-center gap-1.5"
            :class="filterType === t
              ? (t === 'rehearsal' ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
                : t === 'performance' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100')
              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'"
            @click="filterType = t"
          >
            <span v-if="t === 'rehearsal'" class="w-2 h-2 rounded-full bg-violet-500"></span>
            <span v-else-if="t === 'performance'" class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <CalendarDays v-else class="w-3 h-3" />
            {{ t === 'all' ? 'Todos' : t === 'rehearsal' ? 'Ensayos' : 'Actuaciones' }}
          </button>
        </div>

        <div class="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-1"></div>

        <Select v-model="filterContest">
          <SelectTrigger class="w-44 h-9 border-2"><SelectValue placeholder="Concurso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los concursos</SelectItem>
            <SelectItem v-for="c in facets.contests" :key="c.id" :value="c.id">{{ c.name }}</SelectItem>
          </SelectContent>
        </Select>

        <div class="ml-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-violet-500"></span>{{ rehearsalCount }} ensayos</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>{{ performanceCount }} actuaciones</span>
          <span>· {{ totalEvents }} total</span>
        </div>
      </div>
    </Card>

    <!-- Calendar -->
    <Card class="overflow-hidden border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950/50">
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center justify-between gap-4 p-5 border-b border-zinc-100 dark:border-zinc-900">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-bold capitalize">{{ headerLabel }}</h2>
          <Button variant="outline" size="sm" class="h-8 px-3 font-bold" @click="goToday">Hoy</Button>
        </div>
        <div class="flex items-center gap-2">
          <div class="inline-flex rounded-md border-2 border-zinc-200 dark:border-zinc-800 p-0.5">
            <button
              v-for="v in (['day','week','month'] as const)"
              :key="v"
              type="button"
              class="px-3 h-7 text-[11px] font-bold uppercase tracking-widest rounded transition-colors"
              :class="view === v
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'"
              @click="view = v"
            >
              {{ v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes' }}
            </button>
          </div>
          <Button variant="outline" size="icon" class="h-9 w-9" @click="prev"><ChevronLeft class="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" class="h-9 w-9" @click="next"><ChevronRight class="w-4 h-4" /></Button>
        </div>
      </div>

      <!-- ── MONTH VIEW ─────────────────────────────────────── -->
      <template v-if="view === 'month'">
        <div class="grid grid-cols-7 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div
            v-for="(w, i) in ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']"
            :key="i"
            class="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center"
          >{{ w }}</div>
        </div>
        <div class="grid grid-cols-7 grid-flow-row">
          <div
            v-for="(d, i) in monthGridDays"
            :key="i"
            class="min-h-[120px] border-r border-b border-zinc-100 dark:border-zinc-900 p-1.5 flex flex-col gap-1 cursor-pointer"
            :class="[
              d.getMonth() !== cursor.getMonth() ? 'bg-zinc-50/40 dark:bg-zinc-900/30' : 'bg-white dark:bg-zinc-950/40',
              (i + 1) % 7 === 0 ? 'border-r-0' : ''
            ]"
            @dblclick="goToDay(d)"
          >
            <div class="flex items-center justify-between">
              <span
                class="text-xs font-bold rounded-full"
                :class="[
                  sameDay(d, today) ? 'w-6 h-6 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center'
                    : d.getMonth() !== cursor.getMonth() ? 'text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'
                ]"
              >{{ d.getDate() }}</span>
            </div>
            <button
              v-for="e in dayEvents(d).slice(0, 3)"
              :key="e.id"
              type="button"
              class="text-left rounded px-1.5 py-1 text-[10px] truncate hover:opacity-80 transition"
              :class="eventClasses(e.type, e.isJudgeView)"
              :title="`${e.title}${e.subtitle ? ' · ' + e.subtitle : ''} · ${fmtTime(e.scheduled_at)}`"
              @click="selectedEvent = e"
            >
              <span class="font-bold">{{ fmtTime(e.scheduled_at) }}</span>
              <span class="ml-1 truncate">{{ e.title }}</span>
              <span v-if="e.subtitle" class="ml-0.5 opacity-70">· {{ e.subtitle }}</span>
            </button>
            <button
              v-if="dayEvents(d).length > 3"
              type="button"
              class="text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 text-left px-1.5"
              @click="selectedEvent = { _isDayList: true, day: d, list: dayEvents(d) }"
            >
              {{ dayEvents(d).length - 3 }} más...
            </button>
          </div>
        </div>
      </template>

      <!-- ── WEEK VIEW ──────────────────────────────────────── -->
      <template v-else-if="view === 'week'">
        <div class="grid border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30" style="grid-template-columns: 64px repeat(7, minmax(0, 1fr));">
          <div></div>
          <div
            v-for="d in weekDays"
            :key="d.toISOString()"
            class="px-2 py-3 text-center border-l border-zinc-100 dark:border-zinc-900"
          >
            <div class="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {{ d.toLocaleDateString('es-ES', { weekday: 'short' }) }}
            </div>
            <div
              class="mt-0.5 text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full cursor-pointer hover:opacity-70 transition-opacity"
              :class="sameDay(d, today) ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-700 dark:text-zinc-300'"
              @click="goToDay(d)"
            >{{ d.getDate() }}</div>
          </div>
        </div>

        <div ref="weekScrollRef" class="overflow-y-auto" style="max-height: 70vh;">
          <div class="relative grid" style="grid-template-columns: 64px repeat(7, minmax(0, 1fr));">
            <div>
              <div
                v-for="h in HOURS"
                :key="h"
                class="border-b border-zinc-100 dark:border-zinc-900 pr-2 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-400"
                :style="{ height: SLOT_HEIGHT + 'px' }"
              >
                <span class="-translate-y-2 inline-block pt-1">{{ hourLabel(h) }}</span>
              </div>
            </div>

            <div
              v-for="d in weekDays"
              :key="d.toISOString()"
              class="relative border-l border-zinc-100 dark:border-zinc-900"
              :class="sameDay(d, today) ? 'bg-zinc-50/40 dark:bg-zinc-900/20' : ''"
            >
              <div
                v-for="h in HOURS"
                :key="h"
                class="border-b border-zinc-100 dark:border-zinc-900"
                :style="{ height: SLOT_HEIGHT + 'px' }"
              ></div>

              <button
                v-for="e in dayEvents(d)"
                :key="e.id"
                type="button"
                class="absolute left-1 right-1 rounded-md px-2 py-1.5 text-left hover:opacity-90 transition shadow-sm overflow-hidden"
                :class="eventClasses(e.type, e.isJudgeView)"
                :style="{
                  top: eventTopPx(e) + 'px',
                  minHeight: eventHeightPx(e) + 'px',
                  zIndex: 5
                }"
                @click="selectedEvent = e"
              >
                <div class="text-[10px] font-bold leading-tight">{{ fmtTime(e.scheduled_at) }} – {{ eventEndLabel(e) }}</div>
                <div class="text-[11px] font-semibold truncate leading-tight">{{ e.title }}</div>
                <div v-if="e.subtitle" class="text-[10px] opacity-70 truncate leading-tight">{{ e.subtitle }}</div>
                <div class="text-[10px] opacity-70 truncate leading-tight">{{ e.category_name }}</div>
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- ── DAY VIEW ───────────────────────────────────────── -->
      <template v-else>
        <div ref="dayScrollRef" class="overflow-y-auto" style="max-height: 70vh;">
          <div class="relative grid" style="grid-template-columns: 80px 1fr;">
            <div>
              <div
                v-for="h in HOURS"
                :key="h"
                class="border-b border-zinc-100 dark:border-zinc-900 pr-3 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-400"
                :style="{ height: SLOT_HEIGHT + 'px' }"
              >
                <span class="-translate-y-2 inline-block pt-1">{{ hourLabel(h) }}</span>
              </div>
            </div>

            <div class="relative border-l border-zinc-100 dark:border-zinc-900">
              <div
                v-for="h in HOURS"
                :key="h"
                class="border-b border-zinc-100 dark:border-zinc-900"
                :style="{ height: SLOT_HEIGHT + 'px' }"
              ></div>

              <button
                v-for="e in dayEvents(cursor)"
                :key="e.id"
                type="button"
                class="absolute left-2 right-2 rounded-md px-3 py-2 text-left hover:opacity-90 transition shadow-sm overflow-hidden"
                :class="eventClasses(e.type, e.isJudgeView)"
                :style="{
                  top: eventTopPx(e) + 'px',
                  minHeight: eventHeightPx(e) + 'px',
                  zIndex: 5
                }"
                @click="selectedEvent = e"
              >
                <div class="text-[10px] font-bold leading-tight">{{ fmtTime(e.scheduled_at) }} – {{ eventEndLabel(e) }}</div>
                <div class="text-sm font-semibold leading-tight truncate">{{ e.title }}</div>
                <div v-if="e.subtitle" class="text-[11px] opacity-70 leading-tight truncate">{{ e.subtitle }}</div>
                <div class="text-[11px] opacity-70 leading-tight truncate">{{ e.contest_name }} · {{ e.category_name }}</div>
              </button>

              <div v-if="!dayEvents(cursor).length" class="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
                Sin eventos este día
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <div v-if="pending" class="text-xs text-muted-foreground">Cargando eventos...</div>

    <!-- Event detail / day list dialog -->
    <Dialog :open="!!selectedEvent" @update:open="(v) => { if (!v) selectedEvent = null }">
      <DialogContent class="max-w-md rounded-2xl border-2">
        <template v-if="selectedEvent && !selectedEvent._isDayList">
          <DialogHeader>
            <div class="flex items-center gap-2 mb-1">
              <span class="w-2.5 h-2.5 rounded-full" :class="eventDot(selectedEvent.type, selectedEvent.isJudgeView)"></span>
              <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {{ selectedEvent.type === 'rehearsal' ? 'Ensayo' : 'Actuación' }}
                <span v-if="selectedEvent.isJudgeView">· Jurado</span>
              </span>
            </div>
            <DialogTitle class="text-lg">{{ selectedEvent.title }}</DialogTitle>
            <DialogDescription v-if="selectedEvent.subtitle">
              {{ selectedEvent.subtitle }}
            </DialogDescription>
            <DialogDescription>
              {{ new Date(selectedEvent.scheduled_at).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}
            </DialogDescription>
          </DialogHeader>
          <div class="space-y-2 text-sm pt-2">
            <div v-if="selectedEvent.location" class="flex justify-between">
              <span class="text-muted-foreground">Ubicación</span>
              <span class="font-semibold">{{ selectedEvent.location }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Concurso</span>
              <NuxtLink v-if="selectedEvent.contest_slug" :to="`/my-contests/${selectedEvent.contest_slug}`" class="font-semibold hover:underline">{{ selectedEvent.contest_name }}</NuxtLink>
              <span v-else class="font-semibold">{{ selectedEvent.contest_name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Categoría</span>
              <span class="font-semibold">{{ selectedEvent.category_name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Ronda</span>
              <span class="font-semibold">{{ selectedEvent.round_name }}</span>
            </div>
            <div v-if="selectedEvent.order != null" class="flex justify-between">
              <span class="text-muted-foreground">Orden</span>
              <span class="font-semibold">#{{ selectedEvent.order }}</span>
            </div>
            <div v-if="selectedEvent.accompanist" class="flex justify-between">
              <span class="text-muted-foreground">Acompañante</span>
              <span class="font-semibold">{{ selectedEvent.accompanist }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="selectedEvent && selectedEvent._isDayList">
          <DialogHeader>
            <DialogTitle class="text-lg capitalize">
              {{ selectedEvent.day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) }}
            </DialogTitle>
            <DialogDescription>{{ selectedEvent.list.length }} eventos</DialogDescription>
          </DialogHeader>
          <div class="space-y-1.5 pt-2 max-h-[60vh] overflow-y-auto">
            <button
              v-for="e in selectedEvent.list"
              :key="e.id"
              type="button"
              class="w-full text-left rounded-lg px-3 py-2 text-xs hover:opacity-80 transition"
              :class="eventClasses(e.type, e.isJudgeView)"
              @click="selectedEvent = e"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold">{{ fmtTime(e.scheduled_at) }} · {{ e.title }}</span>
                <span class="text-[10px] uppercase tracking-widest opacity-70">{{ e.type === 'rehearsal' ? 'Ensayo' : 'Actuación' }}</span>
              </div>
              <div class="text-[10px] opacity-80 mt-0.5">{{ e.contest_name }} · {{ e.category_name }}</div>
              <div v-if="e.subtitle" class="text-[10px] opacity-70 mt-0.5">{{ e.subtitle }}</div>
            </button>
          </div>
        </template>
      </DialogContent>
    </Dialog>
  </div>
</template>
