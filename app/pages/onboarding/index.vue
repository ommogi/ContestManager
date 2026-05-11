<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Building2, User, ArrowRight, Loader2, Check, Calendar, IdCard, MapPin, Mail, Upload, Building } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUpload } from '@/components/ui/file-upload'
import { PhoneInput } from '@/components/ui/phone-input'
import { DIAL_CODES, findCountryByName } from '@/utils/countries'
import { validateDni } from '@/utils/dni'
import { DatePicker } from '@/components/ui/date-picker'
import { parseDate, type DateValue, getLocalTimeZone } from '@internationalized/date'
import CountrySelect from '@/components/ui/country-select/CountrySelect.vue'
import { CheckCircle2 } from 'lucide-vue-next'

definePageMeta({
  layout: 'auth'
})

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const returnTo = computed(() => {
  const raw = (route.query.returnTo as string) || ''
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : ''
})

// Wizard State
type Step = 'type' | 'personal' | 'organization' | 'confirm'
const currentStep = ref<Step>('type')
const accountType = ref<'org_owner' | 'user'>('user')
const loading = ref(false)

// Personal Data (user)
const personalData = ref({
  first_name: '',
  last_name: '',
  email: authStore.user?.email || '',
  birthdate: '',
  dni: '',
  phone: '',
  country: ''
})

// Organization Data (org_owner)
const organizationData = ref({
  full_name: '',
  email: authStore.user?.email || '',
  contact_phone: '',
  contact_country: '',
  org_name: '',
  org_slug: '',
  logo_url: null as string | null
})

// UI State
const searchQuery = ref('')
const dniError = ref<string | null>(null)
const phoneError = ref<string | null>(null)

// Computed
const filteredCountries = computed(() => searchCountries(searchQuery.value))

const steps = [
  { id: 'type', title: 'Tipo', description: 'Elige tu tipo de cuenta' },
  { id: 'personal', title: 'Datos', description: 'Información personal' },
  { id: 'organization', title: 'Organización', description: 'Datos de la organización' },
  { id: 'confirm', title: 'Confirmar', description: 'Revisa y confirma' }
]

const visibleSteps = computed(() =>
  accountType.value === 'org_owner'
    ? steps.filter(s => ['type', 'organization', 'confirm'].includes(s.id))
    : steps.filter(s => ['type', 'personal', 'confirm'].includes(s.id))
)
const currentStepIndex = computed(() => visibleSteps.value.findIndex(s => s.id === currentStep.value))

const birthdateValue = computed<DateValue | undefined>({
  get() {
    if (!personalData.value.birthdate) return undefined
    try { return parseDate(String(personalData.value.birthdate).slice(0, 10)) } catch { return undefined }
  },
  set(val) {
    if (!val) { personalData.value.birthdate = ''; return }
    const d = val.toDate(getLocalTimeZone())
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    personalData.value.birthdate = `${y}-${m}-${day}`
  },
})

const personalDefaultDial = computed(() => {
  const c = personalData.value.country.trim()
  if (!c) return '34'
  const country = findCountryByName(c)
  if (country?.code) return DIAL_CODES[country.code] ?? '34'
  return DIAL_CODES[c] ?? '34'
})

const orgDefaultDial = computed(() => {
  const c = organizationData.value.contact_country.trim()
  if (!c) return '34'
  const country = findCountryByName(c)
  if (country?.code) return DIAL_CODES[country.code] ?? '34'
  return DIAL_CODES[c] ?? '34'
})

// Functions
function selectType(type: 'org_owner' | 'user') {
  accountType.value = type
  currentStep.value = type === 'user' ? 'personal' : 'organization'
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

watch(() => organizationData.value.org_name, (val) => {
  if (val && !organizationData.value.org_slug) {
    organizationData.value.org_slug = generateSlug(val)
  }
})

function validatePersonalData(): boolean {
  if (!personalData.value.first_name.trim()) {
    toast.error('El nombre es obligatorio')
    return false
  }
  if (!personalData.value.last_name.trim()) {
    toast.error('Los apellidos son obligatorios')
    return false
  }
  if (!personalData.value.birthdate) {
    toast.error('La fecha de nacimiento es obligatoria')
    return false
  }
  if (!personalData.value.dni.trim()) {
    toast.error('El DNI/NIE es obligatorio')
    return false
  }
  if (!personalData.value.phone.trim()) {
    toast.error('El teléfono es obligatorio')
    return false
  }
  if (!personalData.value.country) {
    toast.error('El país es obligatorio')
    return false
  }
  
  // Validate DNI based on country
  if (personalData.value.country === 'ES') {
    const dniResult = validateDni(personalData.value.dni, 'dni')
    if (!dniResult.valid) {
      dniError.value = dniResult.error || 'DNI no válido'
      toast.error(dniError.value)
      return false
    }
    dniError.value = null
  } else {
    // Generic validation for other countries (6-15 alphanumeric chars)
    if (!/^[A-Z0-9]{6,15}$/i.test(personalData.value.dni)) {
      dniError.value = 'Formato no válido (6-15 caracteres alfanuméricos)'
      toast.error(dniError.value)
      return false
    }
    dniError.value = null
  }
  
  // Validate phone (E.164 format: +[country code][number])
  if (!/^\+[1-9]\d{6,14}$/.test(personalData.value.phone)) {
    phoneError.value = 'Teléfono no válido'
    toast.error(phoneError.value)
    return false
  }
  phoneError.value = null
  
  return true
}

function validateOrganizationData(): boolean {
  if (!organizationData.value.full_name.trim()) {
    toast.error('El nombre de contacto es obligatorio')
    return false
  }
  if (!organizationData.value.contact_phone.trim()) {
    toast.error('El teléfono de contacto es obligatorio')
    return false
  }
  if (!organizationData.value.contact_country) {
    toast.error('El país es obligatorio')
    return false
  }
  if (!organizationData.value.org_name.trim()) {
    toast.error('El nombre de la organización es obligatorio')
    return false
  }
  if (!organizationData.value.org_slug.trim()) {
    toast.error('El slug es obligatorio')
    return false
  }
  
  // Validate phone (E.164 format)
  if (!/^\+[1-9]\d{6,14}$/.test(organizationData.value.contact_phone)) {
    toast.error('Teléfono no válido')
    return false
  }
  
  return true
}

function goToPersonalStep() {
  currentStep.value = 'personal'
}

function goToOrganizationStep() {
  currentStep.value = 'organization'
}

function goToConfirmStep() {
  if (accountType.value === 'user') {
    if (!validatePersonalData()) return
  } else {
    if (!validateOrganizationData()) return
  }
  currentStep.value = 'confirm'
}

function goBack() {
  if (currentStep.value === 'personal' || currentStep.value === 'organization') {
    currentStep.value = 'type'
  } else if (currentStep.value === 'confirm') {
    currentStep.value = accountType.value === 'user' ? 'personal' : 'organization'
  }
}

async function handleSubmit() {
  loading.value = true
  
  try {
    if (accountType.value === 'user') {
      // Save personal profile
      const { error } = await authStore.updateProfile({
        full_name: `${personalData.value.first_name} ${personalData.value.last_name}`.trim(),
        first_name: personalData.value.first_name.trim(),
        last_name: personalData.value.last_name.trim(),
        birthdate: personalData.value.birthdate,
        dni: personalData.value.dni.trim().toUpperCase(),
        country: personalData.value.country,
        phone: personalData.value.phone.trim(),
        account_type: 'user'
      })
      
      if (error) throw error
      toast.success('¡Perfil configurado!')
    } else {
      // Save organization profile
      const { error: profileError } = await authStore.updateProfile({
        full_name: organizationData.value.full_name.trim(),
        account_type: 'org_owner'
      })
      
      if (profileError) throw profileError
      
      // Create organization
      const { error: orgError } = await authStore.createOrganization(
        organizationData.value.org_name.trim(),
        organizationData.value.org_slug.trim(),
        organizationData.value.contact_phone.trim(),
        organizationData.value.contact_country,
        organizationData.value.logo_url
      )
      
      if (orgError) throw orgError
      toast.success('¡Organización creada!')
    }
    
    await navigateTo(returnTo.value || '/dashboard')
  } catch (error: any) {
    console.error('Onboarding error:', error)
    toast.error(error?.message || 'Error al guardar. Intenta de nuevo.')
  } finally {
    loading.value = false
  }
}

// Format date for input
function formatDateForInput(date: string): string {
  if (!date) return ''
  return date
}
</script>

<template>
  <div class="space-y-6">
    <!-- Login link (fixed top-left of screen) -->
    <NuxtLink to="/auth/login?from=onboarding" class="fixed top-4 left-4 z-50 text-md text-zinc-400 underline underline-offset-4 hover:text-zinc-200 transition-colors">
      Iniciar sesión
    </NuxtLink>

    <!-- Stepper (only show after type selection) -->
    <div v-if="currentStep !== 'type'" class="relative px-2">
      <!-- Track + progress -->
      <div class="absolute top-4 left-[calc(100%/6)] right-[calc(100%/6)] h-px bg-zinc-800" />
      <div
        class="absolute top-4 left-[calc(100%/6)] h-px bg-zinc-100 transition-all duration-500"
        :style="{ width: `calc(${(currentStepIndex / (visibleSteps.length - 1)) * 66.66}%)` }"
      />
      <ol class="relative grid" :style="{ gridTemplateColumns: `repeat(${visibleSteps.length}, minmax(0, 1fr))` }">
        <li
          v-for="(step, index) in visibleSteps"
          :key="step.id"
          class="flex flex-col items-center gap-2 min-w-0"
        >
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2 shrink-0"
               :class="currentStepIndex > index
               ? 'bg-emerald-500 text-white border-emerald-500'
               : currentStepIndex === index
                 ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                 : 'bg-zinc-950 text-zinc-400 border-zinc-800'"
          >
            <CheckCircle2 v-if="currentStepIndex > index" class="w-4 h-4" />
            <span v-else>{{ index + 1 }}</span>
          </div>
          <div class="text-center min-w-0 px-1">
            <p
              class="text-xs font-semibold leading-tight truncate"
              :class="currentStepIndex >= index ? 'text-zinc-100' : 'text-zinc-400'"
            >{{ step.title }}</p>
            <p class="text-[10px] text-zinc-400 mt-0.5 hidden md:block truncate">{{ step.description }}</p>
          </div>
        </li>
      </ol>
    </div>

    <!-- Step 1: Choose account type -->
    <template v-if="currentStep === 'type'">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold tracking-tight">Bienvenido a ContestSaaS</h2>
        <p class="text-muted-foreground text-sm mt-1">¿Cómo vas a usar la plataforma?</p>
      </div>

      <div class="grid gap-3">
        <button
          type="button"
          class="group relative flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-zinc-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="selectType('org_owner')"
        >
          <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900">
            <Building2 class="w-5 h-5" />
          </div>
          <div class="flex-1">
            <p class="font-semibold text-sm">Soy una organización</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              Creo y gestiono concursos, categorías y participantes.
            </p>
          </div>
          <ArrowRight class="w-4 h-4 text-muted-foreground mt-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>

        <button
          type="button"
          class="group relative flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-zinc-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="selectType('user')"
        >
          <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100">
            <User class="w-5 h-5" />
          </div>
          <div class="flex-1">
            <p class="font-semibold text-sm">Soy participante o jurado</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              Participo en concursos o evalúo como jurado.
            </p>
          </div>
          <ArrowRight class="w-4 h-4 text-muted-foreground mt-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </div>
    </template>

    <!-- Step 2A: Personal Data (user) -->
    <Card v-else-if="currentStep === 'personal'" class="shadow-lg">
      <CardHeader>
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100">
            <User class="w-5 h-5" />
          </div>
          <div>
            <CardTitle class="text-base">Tu perfil</CardTitle>
            <CardDescription class="text-xs">
              Así te verán los organizadores.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form @submit.prevent="goToConfirmStep" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="first-name">Nombre *</Label>
              <Input
                id="first-name"
                v-model="personalData.first_name"
                type="text"
                placeholder="Ana"
                required
                class="h-10"
              />
            </div>
            <div class="space-y-2">
              <Label for="last-name">Apellidos *</Label>
              <Input
                id="last-name"
                v-model="personalData.last_name"
                type="text"
                placeholder="García López"
                required
                class="h-10"
              />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="email">Email</Label>
            <div class="relative">
              <Mail class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                :model-value="personalData.email"
                type="email"
                disabled
                class="h-10 pl-10 bg-muted/50"
              />
            </div>
            <p class="text-xs text-muted-foreground">El email no se puede modificar</p>
          </div>

          <div class="space-y-2">
            <Label for="birthdate">Fecha de nacimiento *</Label>
            <DatePicker v-model="birthdateValue" placeholder="Selecciona tu fecha" />
          </div>

          <div class="space-y-2">
            <Label for="dni">DNI/NIE/Pasaporte *</Label>
            <div class="relative">
              <IdCard class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="dni"
                v-model="personalData.dni"
                type="text"
                placeholder="12345678A"
                required
                class="h-10 pl-10 uppercase"
                :class="{ 'border-destructive': dniError }"
                @input="dniError = null"
              />
            </div>
            <p v-if="personalData.country === 'ES'" class="text-xs text-muted-foreground">
              Formato DNI: 8 números + letra | NIE: X/Y/Z + 7 números + letra
            </p>
            <p v-else class="text-xs text-muted-foreground">
              6-15 caracteres alfanuméricos
            </p>
          </div>

          <div class="space-y-2">
            <Label for="phone">Teléfono *</Label>
            <PhoneInput
              id="phone"
              v-model="personalData.phone"
              :default-dial="personalDefaultDial"
              placeholder="600 000 000"
              :class="phoneError ? '[&>input]:border-destructive' : ''"
              @update:model-value="phoneError = null"
            />
          </div>

          <div class="space-y-2">
            <Label for="country">País *</Label>
            <CountrySelect v-model="personalData.country" placeholder="Selecciona país…" />
          </div>

          <div class="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              class="flex-1"
              @click="goBack"
            >
              Volver
            </Button>
            <Button type="submit" class="flex-1">
              Siguiente
              <ArrowRight class="w-4 h-4 ml-2" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Step 2B: Organization Data (org_owner) -->
    <Card v-else-if="currentStep === 'organization'" class="shadow-lg">
      <CardHeader>
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900">
            <Building class="w-5 h-5" />
          </div>
          <div>
            <CardTitle class="text-base">Configura tu organización</CardTitle>
            <CardDescription class="text-xs">
              Estos datos se mostrarán en tus concursos públicos.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form @submit.prevent="goToConfirmStep" class="space-y-4">
          <div class="space-y-2">
            <Label for="org-full-name">Nombre completo (contacto) *</Label>
            <Input
              id="org-full-name"
              v-model="organizationData.full_name"
              type="text"
              placeholder="Juan Pérez"
              required
              class="h-10"
            />
          </div>

          <div class="space-y-2">
            <Label for="org-email">Email</Label>
            <div class="relative">
              <Mail class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="org-email"
                :model-value="organizationData.email"
                type="email"
                disabled
                class="h-10 pl-10 bg-muted/50"
              />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="org-phone">Teléfono de contacto *</Label>
            <PhoneInput
              id="org-phone"
              v-model="organizationData.contact_phone"
              :default-dial="orgDefaultDial"
              placeholder="600 000 000"
            />
          </div>

          <div class="space-y-2">
            <Label for="org-country">País *</Label>
            <CountrySelect v-model="organizationData.contact_country" placeholder="Selecciona país…" />
          </div>

          <Separator class="my-4" />

          <div class="space-y-2">
            <Label for="org-name">Nombre de la organización *</Label>
            <Input
              id="org-name"
              v-model="organizationData.org_name"
              type="text"
              placeholder="Conservatorio Municipal"
              required
              class="h-10"
            />
          </div>

          <div class="space-y-2">
            <Label for="org-slug">Slug (URL única) *</Label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 text-muted-foreground text-sm">/org/</span>
              <Input
                id="org-slug"
                v-model="organizationData.org_slug"
                type="text"
                placeholder="conservatorio-municipal"
                required
                class="h-10 pl-12 font-mono text-sm"
              />
            </div>
            <p class="text-xs text-muted-foreground">
              Se generará automáticamente, pero puedes editarlo
            </p>
          </div>

          <div class="space-y-2">
            <Label for="org-logo">Logo de la organización</Label>
            <FileUpload
              v-model="organizationData.logo_url"
              placeholder="Arrastra el logo o haz clic para subir"
            />
          </div>

          <div class="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              class="flex-1"
              @click="goBack"
            >
              Volver
            </Button>
            <Button type="submit" class="flex-1">
              Siguiente
              <ArrowRight class="w-4 h-4 ml-2" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Step 3: Confirmation -->
    <Card v-else-if="currentStep === 'confirm'" class="shadow-lg">
      <CardHeader>
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Check class="w-5 h-5" />
          </div>
          <div>
            <CardTitle class="text-base">Confirma tus datos</CardTitle>
            <CardDescription class="text-xs">
              Revisa que todo esté correcto antes de continuar
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div class="space-y-4">
          <!-- User Confirmation -->
          <template v-if="accountType === 'user'">
            <div class="rounded-lg border bg-muted/50 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2">
                <User class="w-4 h-4" />
                Datos Personales
              </h4>
              <dl class="grid grid-cols-[120px_1fr] gap-2 text-sm">
                <dt class="text-muted-foreground">Nombre:</dt>
                <dd>{{ personalData.first_name }} {{ personalData.last_name }}</dd>
                
                <dt class="text-muted-foreground">Email:</dt>
                <dd>{{ personalData.email }}</dd>
                
                <dt class="text-muted-foreground">Fecha de nacimiento:</dt>
                <dd>{{ new Date(personalData.birthdate).toLocaleDateString('es-ES') }}</dd>
                
                <dt class="text-muted-foreground">DNI/NIE:</dt>
                <dd class="font-mono">{{ personalData.dni.toUpperCase() }}</dd>
                
                <dt class="text-muted-foreground">Teléfono:</dt>
                <dd>{{ personalData.phone }}</dd>
                
                <dt class="text-muted-foreground">País:</dt>
                <dd>
                  {{ COUNTRIES.find(c => c.code === personalData.country)?.flag }}
                  {{ COUNTRIES.find(c => c.code === personalData.country)?.name }}
                </dd>
              </dl>
            </div>
          </template>

          <!-- Organization Confirmation -->
          <template v-else>
            <div class="rounded-lg border bg-muted/50 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2">
                <User class="w-4 h-4" />
                Datos de Contacto
              </h4>
              <dl class="grid grid-cols-[120px_1fr] gap-2 text-sm">
                <dt class="text-muted-foreground">Nombre:</dt>
                <dd>{{ organizationData.full_name }}</dd>
                
                <dt class="text-muted-foreground">Email:</dt>
                <dd>{{ organizationData.email }}</dd>
                
                <dt class="text-muted-foreground">Teléfono:</dt>
                <dd>{{ organizationData.contact_phone }}</dd>
                
                <dt class="text-muted-foreground">País:</dt>
                <dd>
                  {{ COUNTRIES.find(c => c.code === organizationData.contact_country)?.flag }}
                  {{ COUNTRIES.find(c => c.code === organizationData.contact_country)?.name }}
                </dd>
              </dl>
            </div>

            <div class="rounded-lg border bg-muted/50 p-4 space-y-3">
              <h4 class="font-semibold text-sm flex items-center gap-2">
                <Building class="w-4 h-4" />
                Datos de la Organización
              </h4>
              <dl class="grid grid-cols-[120px_1fr] gap-2 text-sm">
                <dt class="text-muted-foreground">Nombre:</dt>
                <dd>{{ organizationData.org_name }}</dd>
                
                <dt class="text-muted-foreground">URL:</dt>
                <dd class="font-mono text-xs">/org/{{ organizationData.org_slug }}</dd>
                
                <dt class="text-muted-foreground">Logo:</dt>
                <dd>
                  <img
                    v-if="organizationData.logo_url"
                    :src="organizationData.logo_url"
                    alt="Logo"
                    class="h-12 w-12 object-cover rounded"
                  />
                  <span v-else class="text-muted-foreground">Sin logo</span>
                </dd>
              </dl>
            </div>
          </template>

          <div class="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              class="flex-1"
              @click="goBack"
            >
              Volver
            </Button>
            <Button
              type="submit"
              class="flex-1"
              :disabled="loading"
              @click="handleSubmit"
            >
              <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
              <Check v-else class="w-4 h-4 mr-2" />
              {{ loading ? 'Guardando...' : 'Comenzar' }}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
