<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Upload, FileSpreadsheet, CircleAlert, CircleCheck, Ticket, ArrowRight, ArrowLeft, Trash2, ShoppingCart } from 'lucide-vue-next'

const TICKET_PRICE_EUR = 1
import { toast } from 'vue-sonner'

interface Category {
  id: string
  name: string
  min_age?: number | null
  max_age?: number | null
  max_participants?: number | null
  current_count?: number
}

const props = defineProps<{
  open: boolean
  contestId: string
  contestStartsAt: string | null
  categories: Category[]
  ticketBalance: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'imported':    [count: number]
}>()

type Phase = 'upload' | 'map' | 'confirm' | 'done'
const phase = ref<Phase>('upload')
const fileName = ref('')
const rawRows = ref<Record<string, string>[]>([])
const parseErrors = ref<string[]>([])
const mapping = ref<Record<string, string>>({})       // csvCategoryName (lower) -> categoryId
const submitting = ref(false)

// ── CSV parser (RFC 4180 basic) ─────────────────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n' || c === '\r') {
        if (field.length || cur.length) { cur.push(field); rows.push(cur); cur = []; field = '' }
        if (c === '\r' && text[i + 1] === '\n') i++
      } else field += c
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur) }
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1).filter((r) => r.some((v) => v && v.trim())).map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((h, i) => { obj[h] = (r[i] ?? '').trim() })
    return obj
  })
}

// Normalize header variants to canonical keys
const HEADER_ALIASES: Record<string, string> = {
  'nombre': 'first_name', 'first name': 'first_name', 'firstname': 'first_name', 'first_name': 'first_name',
  'apellido': 'last_name', 'apellidos': 'last_name', 'last name': 'last_name', 'lastname': 'last_name', 'last_name': 'last_name',
  'fecha': 'birthdate', 'fecha_nacimiento': 'birthdate', 'birthdate': 'birthdate', 'birthday': 'birthdate',
  'categoria': 'category', 'categoría': 'category', 'category': 'category',
  'dni': 'dni', 'documento': 'dni',
  'pais': 'country', 'país': 'country', 'country': 'country',
  'email': 'email', 'correo': 'email', 'e-mail': 'email',
  'telefono': 'phone', 'teléfono': 'phone', 'phone': 'phone', 'movil': 'phone', 'móvil': 'phone',
}

function canonical(r: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(r)) {
    const key = HEADER_ALIASES[k] ?? k
    out[key] = r[k]
  }
  return out
}

function ageAt(birthdate: string, ref: string | null): number | null {
  if (!birthdate) return null
  const bd = new Date(birthdate); if (isNaN(bd.getTime())) return null
  const rd = ref ? new Date(ref) : new Date()
  let age = rd.getFullYear() - bd.getFullYear()
  const m = rd.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && rd.getDate() < bd.getDate())) age--
  return age
}

async function handleFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name
  const text = await file.text()
  try {
    const raw = parseCsv(text).map(canonical)
    rawRows.value = raw
    parseErrors.value = []
    // Auto-map categories by exact/lower match
    const uniqCats = new Set(raw.map((r) => (r.category || '').trim().toLowerCase()).filter(Boolean))
    const m: Record<string, string> = {}
    uniqCats.forEach((nameLower) => {
      const hit = props.categories.find((c) => c.name.trim().toLowerCase() === nameLower)
      if (hit) m[nameLower] = hit.id
    })
    mapping.value = m
    phase.value = distinctCsvCategories.value.some((n) => !m[n.toLowerCase()]) ? 'map' : 'confirm'
  } catch (err: any) {
    parseErrors.value = [err?.message || 'Error al parsear CSV']
  }
}

const distinctCsvCategories = computed(() => {
  const seen = new Set<string>()
  for (const r of rawRows.value) {
    const name = (r.category || '').trim()
    if (name) seen.add(name)
  }
  return Array.from(seen)
})

const unmappedCategories = computed(() =>
  distinctCsvCategories.value.filter((n) => !mapping.value[n.toLowerCase()])
)

// Build final enriched rows + validation per row
interface EnrichedRow {
  idx: number
  category_id: string | null
  first_name: string
  last_name: string
  birthdate: string
  dni: string
  country: string
  email: string
  phone: string
  issues: string[]
}

const enrichedRows = computed<EnrichedRow[]>(() => {
  return rawRows.value.map((r, i) => {
    const issues: string[] = []
    const catName = (r.category || '').trim().toLowerCase()
    const catId = catName ? mapping.value[catName] ?? null : null
    if (!r.first_name) issues.push('Sin nombre')
    if (!r.last_name)  issues.push('Sin apellidos')
    if (!r.birthdate)  issues.push('Sin fecha')
    else {
      const d = new Date(r.birthdate)
      if (isNaN(d.getTime())) issues.push('Fecha inválida')
    }
    if (!catName) issues.push('Sin categoría')
    else if (!catId) issues.push('Categoría sin mapear')
    else {
      const cat = props.categories.find((c) => c.id === catId)
      if (cat) {
        const age = ageAt(r.birthdate, props.contestStartsAt)
        if (age != null) {
          if (cat.min_age != null && age < cat.min_age) issues.push(`Edad < ${cat.min_age}`)
          if (cat.max_age != null && age > cat.max_age) issues.push(`Edad > ${cat.max_age}`)
        }
      }
    }
    return {
      idx: i + 1,
      category_id: catId,
      first_name: r.first_name || '',
      last_name:  r.last_name  || '',
      birthdate:  r.birthdate  || '',
      dni:        r.dni        || '',
      country:    r.country    || '',
      email:      r.email      || '',
      phone:      r.phone      || '',
      issues,
    }
  })
})

const validRows = computed(() => enrichedRows.value.filter((r) => r.issues.length === 0))
const invalidRows = computed(() => enrichedRows.value.filter((r) => r.issues.length > 0))

const ticketsNeeded = computed(() => validRows.value.length)
const ticketsOk = computed(() => ticketsNeeded.value <= props.ticketBalance)

const ticketsMissing = computed(() => Math.max(0, ticketsNeeded.value - props.ticketBalance))
const missingCostEur = computed(() => ticketsMissing.value * TICKET_PRICE_EUR)
const buyQuantity = ref(0)
watch(ticketsMissing, (v) => { buyQuantity.value = v }, { immediate: true })
const buyCostEur = computed(() => Math.max(0, buyQuantity.value) * TICKET_PRICE_EUR)
const buying = ref(false)

async function buyTickets() {
  if (!buyQuantity.value || buyQuantity.value <= 0) {
    toast.error('Indica una cantidad válida')
    return
  }
  buying.value = true
  try {
    const authStore = useAuthStore()
    // Build return path that re-opens the import dialog on success
    const here = window.location.pathname
    const returnPath = `${here}${here.includes('?') ? '&' : '?'}import=open`
    const res = await $fetch<{ url: string }>('/api/billing/checkout-tickets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authStore.session?.access_token ?? ''}` },
      body: { quantity: buyQuantity.value, return_path: returnPath },
    })
    if (res?.url) window.location.href = res.url
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Error al iniciar compra')
  } finally {
    buying.value = false
  }
}

async function submit() {
  if (!ticketsOk.value) {
    toast.error(
      `Te faltan ${ticketsMissing.value} tickets (${missingCostEur.value}€). Compra un pack en Billing.`
    )
    return
  }
  if (validRows.value.length === 0) {
    toast.error('Sin filas válidas para importar')
    return
  }
  submitting.value = true
  try {
    const authStore = useAuthStore()
    const body = {
      rows: validRows.value.map((r) => ({
        category_id: r.category_id!,
        first_name:  r.first_name,
        last_name:   r.last_name,
        birthdate:   r.birthdate,
        dni:         r.dni || null,
        country:     r.country || null,
        email:       r.email || null,
        phone:       r.phone || null,
      })),
    }
    const res = await $fetch<{ inserted: number }>(
      `/api/contests/${props.contestId}/participants/import`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${authStore.session?.access_token ?? ''}` },
        body,
      }
    )
    toast.success(`${res.inserted} participantes importados`)
    phase.value = 'done'
    emit('imported', res.inserted)
  } catch (e: any) {
    const msg = (e?.data?.statusMessage || e?.message || '') as string
    if (msg.includes('already_enrolled_in_category')) {
      // Parse: "already_enrolled_in_category: dni 12345 cat Piano"
      const m = msg.match(/already_enrolled_in_category:\s*(dni|email)\s+(\S+)\s+cat\s+(.+)$/i)
      if (m) toast.error(`Ya inscrito en "${m[3]}" (${m[1].toUpperCase()}: ${m[2]})`)
      else toast.error('Algún participante ya está inscrito en esa categoría')
    } else {
      toast.error(msg || 'Error al importar')
    }
  } finally {
    submitting.value = false
  }
}

function reset() {
  phase.value = 'upload'
  fileName.value = ''
  rawRows.value = []
  parseErrors.value = []
  mapping.value = {}
}

watch(() => props.open, (v) => { if (!v) reset() })
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-3xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <FileSpreadsheet class="w-5 h-5" />
          Importar participantes desde CSV
        </DialogTitle>
        <DialogDescription>
          Sube un archivo con columnas: <code>first_name, last_name, birthdate, category, dni, country, email, phone</code>
        </DialogDescription>
      </DialogHeader>

      <!-- ── PHASE: upload ────────────────────────────────── -->
      <div v-if="phase === 'upload'" class="space-y-4 py-2">
        <Label
          for="csv-file"
          class="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/40 transition"
        >
          <Upload class="w-8 h-8 text-muted-foreground" />
          <div class="text-center">
            <p class="text-sm font-semibold">Haz click para seleccionar CSV</p>
            <p class="text-[11px] text-muted-foreground">UTF-8, separador coma</p>
          </div>
        </Label>
        <Input id="csv-file" type="file" accept=".csv,text/csv" class="hidden" @change="handleFile" />

        <div v-if="parseErrors.length" class="text-xs text-red-600">
          <p v-for="err in parseErrors" :key="err">{{ err }}</p>
        </div>

        <div class="rounded-lg border border-border p-3 bg-muted/30 text-[11px] text-muted-foreground space-y-1">
          <p><strong>Formato esperado</strong> (primera fila = cabecera):</p>
          <pre class="font-mono text-[10px] leading-relaxed">first_name,last_name,birthdate,category,dni,country,email,phone
Ana,García,2012-05-10,Infantil,12345678A,ES,ana@mail.com,600111222</pre>
        </div>
      </div>

      <!-- ── PHASE: map categories ────────────────────────── -->
      <div v-else-if="phase === 'map'" class="space-y-4 py-2">
        <div class="flex items-center gap-2 text-sm">
          <FileSpreadsheet class="w-4 h-4 text-muted-foreground" />
          <span class="font-semibold">{{ fileName }}</span>
          <Badge variant="outline" class="text-[10px]">{{ rawRows.length }} filas</Badge>
        </div>

        <div class="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 flex gap-2">
          <CircleAlert class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p class="text-xs text-amber-800 dark:text-amber-300">
            Algunas categorías del CSV no coinciden con las del concurso. Asigna una categoría del concurso a cada una.
          </p>
        </div>

        <div class="space-y-2">
          <div
            v-for="name in distinctCsvCategories"
            :key="name"
            class="grid grid-cols-2 gap-3 items-center p-3 rounded-lg border border-border"
          >
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CSV</p>
              <p class="text-sm font-semibold truncate">{{ name }}</p>
            </div>
            <Select
              :model-value="mapping[name.toLowerCase()] ?? ''"
              @update:model-value="(v: any) => (mapping[name.toLowerCase()] = v)"
            >
              <SelectTrigger class="h-9 text-sm">
                <SelectValue placeholder="Elegir categoría del concurso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <!-- ── PHASE: confirm ──────────────────────────────── -->
      <div v-else-if="phase === 'confirm'" class="space-y-4 py-2">
        <div class="grid grid-cols-3 gap-3">
          <div class="rounded-lg border border-border p-3">
            <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total filas</p>
            <p class="text-2xl font-bold">{{ enrichedRows.length }}</p>
          </div>
          <div class="rounded-lg border border-emerald-300 dark:border-emerald-800 p-3">
            <p class="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Válidas</p>
            <p class="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{{ validRows.length }}</p>
          </div>
          <div class="rounded-lg border border-red-300 dark:border-red-800 p-3">
            <p class="text-[10px] font-bold uppercase tracking-widest text-red-700 dark:text-red-300">Con errores</p>
            <p class="text-2xl font-bold text-red-700 dark:text-red-300">{{ invalidRows.length }}</p>
          </div>
        </div>

        <div
          v-if="ticketsOk"
          class="rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3 flex items-center gap-3"
        >
          <Ticket class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div class="flex-1">
            <p class="text-sm font-semibold">Se consumirán {{ ticketsNeeded }} tickets</p>
            <p class="text-[11px] text-muted-foreground">
              Saldo actual: {{ ticketBalance }} tickets · Tras importar: {{ ticketBalance - ticketsNeeded }}
            </p>
          </div>
        </div>
        <div
          v-else
          class="rounded-lg border-2 border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 space-y-3"
        >
          <div class="flex items-start gap-3">
            <Ticket class="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div class="flex-1 space-y-1">
              <p class="text-sm font-bold text-red-900 dark:text-red-200">
                Tickets insuficientes
              </p>
              <p class="text-xs text-red-800 dark:text-red-300">
                Para insertar estos {{ ticketsNeeded }} participantes necesitas
                <strong>{{ ticketsNeeded }} tickets</strong>. Tu saldo es
                <strong>{{ ticketBalance }}</strong> — te faltan
                <strong>{{ ticketsMissing }}</strong>.
              </p>
              <p class="text-xs text-red-700 dark:text-red-400">
                Cada ticket cuesta <strong>{{ TICKET_PRICE_EUR }}€</strong>. Coste mínimo para completar:
                <strong>{{ missingCostEur }}€</strong>.
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 pt-1">
            <div class="flex items-center bg-white dark:bg-zinc-950 border-2 border-red-300 dark:border-red-800 rounded-md overflow-hidden">
              <button type="button"
                class="px-2 py-2 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950 font-bold"
                @click="buyQuantity = Math.max(1, buyQuantity - 1)"
              >−</button>
              <input
                v-model.number="buyQuantity"
                type="number"
                min="1"
                max="500"
                class="w-16 text-center text-sm font-bold bg-transparent outline-none py-2"
              />
              <button type="button"
                class="px-2 py-2 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950 font-bold"
                @click="buyQuantity = Math.min(500, buyQuantity + 1)"
              >+</button>
            </div>
            <span class="text-xs text-red-800 dark:text-red-300 font-bold">
              × {{ TICKET_PRICE_EUR }}€ = <span class="text-base">{{ buyCostEur }}€</span>
            </span>
          </div>
          <button
            type="button"
            :disabled="buying || buyQuantity <= 0"
            class="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-widest transition-colors"
            @click="buyTickets"
          >
            <Loader2 v-if="buying" class="w-4 h-4 animate-spin" />
            <ShoppingCart v-else class="w-4 h-4" />
            {{ buying ? 'Redirigiendo...' : `Comprar ${buyQuantity} ticket${buyQuantity === 1 ? '' : 's'} (${buyCostEur}€)` }}
          </button>
          <NuxtLink
            to="/billing"
            class="block text-center text-[10px] font-bold uppercase tracking-widest text-red-700 dark:text-red-400 hover:underline"
            @click="emit('update:open', false)"
          >
            o ver packs con descuento
          </NuxtLink>
        </div>

        <div class="max-h-64 overflow-auto rounded-lg border border-border">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th class="text-left p-2 font-bold">#</th>
                <th class="text-left p-2 font-bold">Nombre</th>
                <th class="text-left p-2 font-bold">Fecha</th>
                <th class="text-left p-2 font-bold">Categoría</th>
                <th class="text-left p-2 font-bold">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in enrichedRows"
                :key="r.idx"
                :class="r.issues.length ? 'bg-red-50/50 dark:bg-red-950/10' : ''"
              >
                <td class="p-2 text-muted-foreground">{{ r.idx }}</td>
                <td class="p-2">{{ r.first_name }} {{ r.last_name }}</td>
                <td class="p-2 font-mono text-[10px]">{{ r.birthdate }}</td>
                <td class="p-2">
                  <span v-if="r.category_id">
                    {{ categories.find((c) => c.id === r.category_id)?.name ?? '?' }}
                  </span>
                  <span v-else class="text-red-600">—</span>
                </td>
                <td class="p-2">
                  <Badge v-if="!r.issues.length" variant="outline" class="text-[9px] text-emerald-700 border-emerald-300">
                    OK
                  </Badge>
                  <span v-else class="text-[10px] text-red-700 dark:text-red-400">
                    {{ r.issues.join(' · ') }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── PHASE: done ─────────────────────────────────── -->
      <div v-else class="py-6 text-center space-y-3">
        <div class="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
          <CircleCheck class="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p class="text-lg font-bold">Importación completada</p>
        <p class="text-sm text-muted-foreground">Los participantes ya están en el concurso.</p>
      </div>

      <DialogFooter>
        <Button
          v-if="phase === 'upload'"
          variant="outline"
          @click="emit('update:open', false)"
        >Cancelar</Button>

        <template v-else-if="phase === 'map'">
          <Button variant="outline" @click="reset">
            <ArrowLeft class="w-3.5 h-3.5 mr-1" /> Volver
          </Button>
          <Button :disabled="unmappedCategories.length > 0" @click="phase = 'confirm'">
            Continuar <ArrowRight class="w-3.5 h-3.5 ml-1" />
          </Button>
        </template>

        <template v-else-if="phase === 'confirm'">
          <Button variant="outline" @click="phase = distinctCsvCategories.length ? 'map' : 'upload'">
            <ArrowLeft class="w-3.5 h-3.5 mr-1" /> Volver
          </Button>
          <Button variant="outline" @click="reset">
            <Trash2 class="w-3.5 h-3.5 mr-1" /> Descartar
          </Button>
          <Button :disabled="!ticketsOk || !validRows.length || submitting" @click="submit">
            <Loader2 v-if="submitting" class="w-3.5 h-3.5 mr-1 animate-spin" />
            <Upload v-else class="w-3.5 h-3.5 mr-1" />
            Importar {{ validRows.length }} participantes
          </Button>
        </template>

        <Button v-else @click="emit('update:open', false)">Cerrar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
