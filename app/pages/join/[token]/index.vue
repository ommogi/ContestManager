<script setup lang="ts">
import { toast } from 'vue-sonner'
import { computed, ref, reactive, watchEffect, watch } from 'vue'
import { marked } from 'marked'
import { Loader2, Trophy, Calendar, Users, Lock, CheckCircle2, ArrowRight, ArrowLeft, FileText } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePicker } from '@/components/ui/date-picker'
import { PhoneInput } from '@/components/ui/phone-input'
import { CountrySelect } from '@/components/ui/country-select'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { parseDate, getLocalTimeZone, type DateValue } from '@internationalized/date'
import { DIAL_CODES, findCountryByName } from '@/utils/countries'
import { validateDni } from '@/utils/dni'

definePageMeta({
  layout: 'auth',
})

const route = useRoute()
const authStore = useAuthStore()
const token = computed(() => String(route.params.token))

// ── Public fetch (no auth) ──────────────────────────────────────────────
const { data, pending, error: fetchError } = await useFetch<{
  contest: {
    id: string; slug: string; name: string; description: string | null;
    cover_image_url: string | null; type: string; status: string;
    starts_at: string | null; ends_at: string | null; registration_open: boolean;
    entry_fee_cents: number; org_charges_enabled: boolean;
    rules: string | null; settings: Record<string, unknown> | null
  },
  categories: Array<{
    id: string; name: string; description: string | null; status: string;
    min_age: number | null; max_age: number | null;
    max_participants: number | null; current_count: number
  }>
}>(() => `/api/public/inscriptions/${token.value}`, {
  server: true,
})

const contest = computed(() => data.value?.contest)
const categories = computed(() => data.value?.categories ?? [])
const hasRules = computed(() => !!contest.value?.rules)

// ── Phase: info → enrollment ──────────────────────────────────────────────
const phase = ref<'info' | 'enrollment'>('info')
const accepted = ref(false)
const activeTab = ref<'description' | 'reglamento'>('description')

const parsedDescription = computed(() => marked.parse(contest.value?.description || '') as string)
const parsedRules = computed(() => marked.parse(contest.value?.rules || '') as string)

// ── Auth gate ────────────────────────────────────────────────────────────
const isAuthed = computed(() => authStore.isAuthenticated)
const returnTo = computed(() => `/join/${token.value}`)
const loginHref = computed(() => `/auth/login?returnTo=${encodeURIComponent(returnTo.value)}`)
const signupHref = computed(() => `/auth/login?mode=register&returnTo=${encodeURIComponent(returnTo.value)}`)

// ── Form state ───────────────────────────────────────────────────────────
const form = reactive({
  category_id: '' as string,
  first_name: '',
  last_name: '',
  birthdate: '',
  dni: '',
  country: '',
  phone: '',
  email: '',
})

const birthdateValue = computed<DateValue | undefined>({
  get() {
    if (!form.birthdate) return undefined
    try { return parseDate(form.birthdate.slice(0, 10)) } catch { return undefined }
  },
  set(val) {
    if (!val) { form.birthdate = ''; return }
    const d = val.toDate(getLocalTimeZone())
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    form.birthdate = `${y}-${m}-${day}`
  },
})

const defaultDial = computed(() => {
  const c = form.country.trim()
  if (!c) return '34'
  const country = findCountryByName(c)
  if (country?.code) return DIAL_CODES[country.code] ?? '34'
  return DIAL_CODES[c] ?? '34'
})

// Prefill from session & profile (once, then stop reacting)
const prefilled = ref(false)
watchEffect(() => {
  if (prefilled.value) return
  const p = authStore.profile
  if (!p) return
  if (authStore.user?.email && !form.email) form.email = authStore.user.email
  const fn = (authStore.profile as any)?.full_name as string | undefined
  if (fn && !form.first_name && !form.last_name) {
    const parts = fn.split(' ')
    form.first_name = parts.shift() || ''
    form.last_name = parts.join(' ')
  }
  if (p.first_name && !form.first_name) form.first_name = p.first_name
  if (p.last_name && !form.last_name) form.last_name = p.last_name
  if (p.dni && !form.dni) form.dni = p.dni
  if (p.country && !form.country) form.country = p.country
  if (p.phone && !form.phone) form.phone = p.phone
  if (p.birthdate && !form.birthdate) form.birthdate = p.birthdate
  if (p.first_name || p.last_name || p.dni || p.country || p.phone || p.birthdate) {
    prefilled.value = true
  }
})

// ── Age eligibility ──────────────────────────────────────────────────────
function ageAt(birthdate: string, ref: string | null): number | null {
  if (!birthdate) return null
  const bd = new Date(birthdate)
  if (isNaN(bd.getTime())) return null
  const refDate = ref ? new Date(ref) : new Date()
  let age = refDate.getFullYear() - bd.getFullYear()
  const m = refDate.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && refDate.getDate() < bd.getDate())) age--
  return age
}

const computedAge = computed(() => ageAt(form.birthdate, contest.value?.starts_at ?? null))

const dniError = computed(() => {
  if (!form.dni) return ''
  const r = validateDni(form.dni)
  return r.valid ? '' : (r.error || 'Documento no válido')
})

function categoryEligible(c: any, age: number | null) {
  if (age == null) return true // don't filter until birthdate entered
  if (c.min_age != null && age < c.min_age) return false
  if (c.max_age != null && age > c.max_age) return false
  return true
}
function categoryFull(c: any) {
  return c.max_participants != null && c.current_count >= c.max_participants
}

const eligibleCategories = computed(() =>
  categories.value.filter(c => categoryEligible(c, computedAge.value) && !categoryFull(c))
)

// Auto-clear category if it becomes invalid
watch([computedAge, () => form.category_id], () => {
  if (!form.category_id) return
  const cat = categories.value.find(c => c.id === form.category_id)
  if (!cat) return
  if (!categoryEligible(cat, computedAge.value) || categoryFull(cat)) {
    form.category_id = ''
  }
})

// ── Submit ───────────────────────────────────────────────────────────────
const submitting = ref(false)
const success = ref(false)

const requiresPayment = computed(() =>
  (contest.value?.entry_fee_cents ?? 0) > 0 && contest.value?.org_charges_enabled
)

async function submit() {
  if (!isAuthed.value) {
    toast.error('Debes iniciar sesión o registrarte para inscribirte.')
    await navigateTo(loginHref.value)
    return
  }
  if (!form.category_id || !form.first_name || !form.last_name || !form.birthdate) {
    toast.error('Completa los campos obligatorios.')
    return
  }
  if (form.dni) {
    const dniResult = validateDni(form.dni)
    if (!dniResult.valid) {
      toast.error(dniResult.error || 'DNI/NIE no válido')
      return
    }
  }
  submitting.value = true
  try {
    const accessToken = authStore.session?.access_token ?? ''
    const body = {
      category_id: form.category_id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      birthdate: form.birthdate,
      dni: form.dni.trim() || null,
      country: form.country.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    }
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    }

    if (requiresPayment.value) {
      const res = await $fetch<{ url: string }>(
        `/api/public/inscriptions/${token.value}/checkout`,
        { method: 'POST', headers, body }
      )
      if (res?.url) window.location.href = res.url
      return
    }

    await $fetch(`/api/public/inscriptions/${token.value}/enroll`, {
      method: 'POST', headers, body,
    })
    success.value = true
    toast.success('¡Inscripción completada!')
  } catch (e: any) {
    const msg = e?.statusMessage || e?.data?.statusMessage || 'Error al inscribirse'
    toast.error(msg)
  } finally {
    submitting.value = false
  }
}

const registrationClosed = computed(() => contest.value && !contest.value.registration_open)
</script>

<template>
  <div class="w-full">
    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 class="w-8 h-8 animate-spin" />
    </div>

    <!-- Error -->
    <Card v-else-if="fetchError || !contest" class="shadow-lg">
      <CardContent class="py-12 text-center space-y-2">
        <p class="text-lg font-semibold">Enlace no válido</p>
        <p class="text-sm text-muted-foreground">
          Este enlace de inscripción no existe o ha expirado.
        </p>
      </CardContent>
    </Card>

    <!-- Success -->
    <Card v-else-if="success" class="shadow-lg">
      <CardContent class="py-12 text-center space-y-4">
        <div class="w-16 h-16 mx-auto rounded-full bg-emerald-950/40 flex items-center justify-center">
          <CheckCircle2 class="w-8 h-8 text-emerald-400" />
        </div>
        <div class="space-y-1">
          <p class="text-xl font-bold">¡Inscripción completada!</p>
          <p class="text-sm text-muted-foreground">
            Te hemos añadido a <strong>{{ contest.name }}</strong>.
            Puedes ver tu participación en "Mis concursos".
          </p>
        </div>
        <Button class="mt-2" @click="navigateTo(`/my-contests/${contest.slug}`)">
          Ir a mi concurso <ArrowRight class="w-4 h-4 ml-2" />
        </Button>
      </CardContent>
    </Card>

    <!-- Main -->
    <div v-else class="space-y-4">
      <!-- Hero -->
      <div class="hero-wrapper" :class="phase === 'enrollment' ? 'hero-wrapper--narrow' : ''">
        <Card class="shadow-lg overflow-hidden">
        <div
          v-if="contest.cover_image_url"
          class="h-32 bg-cover bg-center"
          :style="{ backgroundImage: `url(${contest.cover_image_url})` }"
        />
        <CardHeader>
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <CardTitle class="text-xl">{{ contest.name }}</CardTitle>
            </div>
            <Badge variant="outline" class="shrink-0">Inscripción</Badge>
          </div>
          <div v-if="contest.starts_at" class="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
            <Calendar class="w-3.5 h-3.5" />
            Inicio: {{ new Date(contest.starts_at).toLocaleDateString() }}
          </div>
        </CardHeader>
        </Card>
      </div>

      <!-- Closed banner -->
      <Card v-if="registrationClosed" class="border-destructive/50">
        <CardContent class="py-6 text-center space-y-1">
          <Lock class="w-6 h-6 mx-auto text-destructive" />
          <p class="font-semibold">Inscripciones cerradas</p>
          <p class="text-sm text-muted-foreground">El organizador ha cerrado el registro.</p>
        </CardContent>
      </Card>

      <!-- ── PHASE: Info (Description + Rules + Acceptance) ─────────────── -->
      <Transition name="phase-swap" mode="out-in">
        <Card v-if="phase === 'info'" key="info" class="shadow-lg phase-card">
          <CardHeader>
            <CardTitle class="text-base">Información del concurso</CardTitle>
            <CardDescription>
              Lee la descripción y el reglamento antes de inscribirte
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            <Tabs v-model="activeTab">
              <TabsList class="w-full">
                <TabsTrigger value="description" class="flex-1">Descripción</TabsTrigger>
                <TabsTrigger value="reglamento" class="flex-1">Reglamento</TabsTrigger>
              </TabsList>

              <TabsContent value="description" class="mt-4">
                <div
                  v-if="contest.description"
                  class="rich-content text-sm prose prose-sm max-w-none"
                  v-html="parsedDescription"
                />
                <p v-else class="text-sm text-muted-foreground py-4 text-center">
                  El organizador no ha añadido una descripción.
                </p>
              </TabsContent>

              <TabsContent value="reglamento" class="mt-4">
                <div
                  v-if="contest.rules"
                  class="rich-content text-sm prose prose-sm max-w-none"
                  v-html="parsedRules"
                />
                <div v-else class="flex flex-col items-center gap-2 py-6 text-center">
                  <FileText class="w-8 h-8 text-muted-foreground/40" />
                  <p class="text-sm text-muted-foreground">
                    El organizador no ha publicado el reglamento.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <!-- Entry fee -->
            <div v-if="requiresPayment" class="rounded-lg border border-border bg-muted/40 p-3 flex items-center justify-between">
              <div>
                <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Cuota de inscripción</p>
                <p class="text-xs text-muted-foreground">Pago seguro vía Stripe</p>
              </div>
              <p class="text-xl font-bold">€{{ ((contest.entry_fee_cents || 0) / 100).toFixed(2) }}</p>
            </div>

            <!-- Acceptance checkbox -->
            <div class="flex items-start gap-3 pt-2">
              <Checkbox
                id="accept-terms"
                v-model="accepted"
                class="mt-0.5"
              />
              <label
                for="accept-terms"
                class="text-sm leading-snug cursor-pointer select-none"
              >
                He leído y acepto las bases y condiciones
              </label>
            </div>

            <Button
              class="w-full"
              :disabled="!accepted"
              @click="phase = 'enrollment'"
            >
              Continuar inscripción
              <ArrowRight class="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <!-- Auth required -->
        <Card v-else-if="!isAuthed" key="auth" class="shadow-lg border-primary/30 phase-card">
          <CardContent class="py-8 text-center space-y-4">
            <Lock class="w-8 h-8 mx-auto text-muted-foreground" />
            <div class="space-y-1">
              <p class="font-semibold">Necesitas una cuenta</p>
              <p class="text-sm text-muted-foreground">
                Para inscribirte en <strong>{{ contest.name }}</strong> debes iniciar sesión o registrarte primero.
              </p>
            </div>
            <div class="flex flex-col sm:flex-row gap-2 pt-2">
              <Button class="flex-1" @click="navigateTo(loginHref)">Iniciar sesión</Button>
              <Button variant="outline" class="flex-1" @click="navigateTo(signupHref)">Crear cuenta</Button>
            </div>
          </CardContent>
        </Card>

        <!-- Enrollment form -->
        <Card v-else key="enrollment" class="shadow-lg phase-card phase-card--narrow">
          <CardHeader>
            <div class="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                class="-ml-2 h-8 w-8"
                @click="phase = 'info'"
              >
                <ArrowLeft class="w-4 h-4" />
              </Button>
              <div>
                <CardTitle class="text-base">Datos de inscripción</CardTitle>
                <CardDescription>
                  Completa tus datos. La categoría se filtrará por edad al indicar tu fecha de nacimiento.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="submit" class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1.5">
                  <Label for="first_name">Nombre *</Label>
                  <Input id="first_name" v-model="form.first_name" required />
                </div>
                <div class="space-y-1.5">
                  <Label for="last_name">Apellidos *</Label>
                  <Input id="last_name" v-model="form.last_name" required />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1.5">
                  <Label>Fecha de nacimiento *</Label>
                  <DatePicker v-model="birthdateValue" placeholder="Selecciona tu fecha" />
                  <p v-if="computedAge != null" class="text-xs text-muted-foreground">
                    Edad al inicio del concurso: <strong>{{ computedAge }}</strong> años
                  </p>
                </div>
                <div class="space-y-1.5">
                  <Label for="dni">DNI / Documento</Label>
                  <Input id="dni" v-model="form.dni" :class="dniError ? 'border-destructive' : ''" />
                  <p v-if="dniError" class="text-xs text-destructive">{{ dniError }}</p>
                </div>
              </div>

              <div class="space-y-4">
                <div class="space-y-1.5">
                  <Label>País</Label>
                  <CountrySelect v-model="form.country" placeholder="Selecciona país…" />
                </div>
                <div class="space-y-1.5">
                  <Label>Teléfono</Label>
                  <PhoneInput v-model="form.phone" :default-dial="defaultDial" placeholder="600 11 22 33" />
                </div>
              </div>

              <div class="space-y-1.5">
                <Label for="email">Email de contacto</Label>
                <Input id="email" v-model="form.email" type="email" />
              </div>

              <!-- Category -->
              <div class="space-y-1.5">
                <Label for="category">Categoría *</Label>
                <Select v-model="form.category_id">
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Selecciona una categoría…" />
                  </SelectTrigger>
                  <SelectContent>
                    <template v-if="eligibleCategories.length">
                      <SelectItem
                        v-for="c in eligibleCategories"
                        :key="c.id"
                        :value="c.id"
                      >
                        <div class="flex flex-col gap-0.5">
                          <span class="font-medium">{{ c.name }}</span>
                          <span class="text-xs text-muted-foreground">
                            <template v-if="c.min_age != null || c.max_age != null">
                              {{ c.min_age ?? '–' }}–{{ c.max_age ?? '–' }} años ·
                            </template>
                            <template v-if="c.max_participants != null">
                              {{ c.current_count }}/{{ c.max_participants }} plazas
                            </template>
                            <template v-else>
                              {{ c.current_count }} inscritos
                            </template>
                          </span>
                        </div>
                      </SelectItem>
                    </template>
                    <div v-else class="px-3 py-4 text-xs text-muted-foreground text-center">
                      <template v-if="form.birthdate">
                        No hay categorías disponibles para tu edad.
                      </template>
                      <template v-else>
                        Introduce tu fecha de nacimiento para ver categorías.
                      </template>
                    </div>
                  </SelectContent>
                </Select>
                <div v-if="form.birthdate && categories.length && !eligibleCategories.length" class="flex items-start gap-1.5 text-xs text-muted-foreground mt-1">
                  <Users class="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Ninguna categoría admite tu edad ({{ computedAge }} años) o todas están llenas.
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                class="w-full"
                :disabled="submitting || !form.category_id"
              >
                <Loader2 v-if="submitting" class="w-4 h-4 mr-2 animate-spin" />
                <Trophy v-else class="w-4 h-4 mr-2" />
                {{ submitting
                  ? (requiresPayment ? 'Redirigiendo al pago…' : 'Enviando…')
                  : (requiresPayment ? 'Pagar e inscribirse' : 'Confirmar inscripción') }}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.hero-wrapper {
  transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              margin 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  max-width: 100%;
}

.hero-wrapper--narrow {
  max-width: 28rem;
  margin-left: auto;
  margin-right: auto;
}

.phase-card {
  transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.25s ease;
}

.phase-card--narrow {
  max-width: 28rem;
  margin-left: auto;
  margin-right: auto;
}

.phase-swap-enter-active,
.phase-swap-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.phase-swap-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.phase-swap-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
