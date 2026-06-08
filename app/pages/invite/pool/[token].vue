<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Loader2, CheckCircle2, XCircle, Users, ArrowRight, Mail } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '~/api/apiClient'

definePageMeta({
  layout: 'auth',
})

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const token = computed(() => String(route.params.token))

type PoolInvitationData = {
  invitation: {
    id: string
    email: string | null
    full_name: string | null
    specialty: string | null
    status: 'pending' | 'accepted' | 'rejected'
    invited_at: string | null
    responded_at: string | null
  }
  organization: { id: string; name: string } | null
}

const { data, pending, error: fetchError, refresh } = await useFetch<PoolInvitationData>(
  () => `/api/invitations/pool/${token.value}`,
  { server: false },
)

const invitation = computed(() => data.value?.invitation)
const organization = computed(() => data.value?.organization)

const isAuthed = computed(() => authStore.isAuthenticated)
const userEmail = computed(() => (authStore.user?.email || '').toLowerCase())
const inviteEmail = computed(() => (invitation.value?.email || '').toLowerCase())
const emailMatches = computed(() => !!inviteEmail.value && inviteEmail.value === userEmail.value)

const returnTo = computed(() => `/invite/pool/${token.value}`)
const loginHref = computed(() => `/auth/login?returnTo=${encodeURIComponent(returnTo.value)}`)
const signupHref = computed(() => `/auth/login?mode=register&returnTo=${encodeURIComponent(returnTo.value)}`)

const responding = ref(false)

async function respond(action: 'accept' | 'reject') {
  if (responding.value) return
  responding.value = true
  try {
    await apiClient(`/api/invitations/pool/${token.value}/respond`, {
      method: 'POST',
      body: { action },
    })
    toast.success(action === 'accept' ? 'Has aceptado la invitación' : 'Has rechazado la invitación')
    await refresh()
    if (action === 'accept') {
      // Redirect to dashboard or judge pool
      router.push('/dashboard')
    }
  } catch (err: any) {
    const msg = err?.data?.statusMessage || err?.statusMessage || 'No se pudo procesar la respuesta'
    toast.error(msg)
  } finally {
    responding.value = false
  }
}

// Auto-action via query string (?action=accept|reject) once authenticated & matching.
onMounted(async () => {
  const action = (route.query.action as string | undefined)?.toLowerCase()
  if (action !== 'accept' && action !== 'reject') return
  if (!isAuthed.value || !emailMatches.value) return
  if (invitation.value?.status !== 'pending') return
  await respond(action as 'accept' | 'reject')
  // Clean the URL so a refresh doesn't try again.
  router.replace({ path: route.path })
})
</script>

<template>
  <div class="max-w-xl mx-auto py-10">
    <div v-if="pending" class="flex flex-col items-center gap-3 py-20 text-muted-foreground">
      <Loader2 class="h-6 w-6 animate-spin" />
      <p class="text-sm">Cargando invitación...</p>
    </div>

    <Card v-else-if="fetchError || !invitation">
      <CardHeader>
        <CardTitle>Invitación no encontrada</CardTitle>
        <CardDescription>
          Este enlace no es válido o ha caducado. Si crees que es un error, contacta con la organización que te invitó.
        </CardDescription>
      </CardHeader>
    </Card>

    <Card v-else>
      <CardHeader class="space-y-3">
        <div class="flex items-center gap-2">
          <Users class="h-5 w-5 text-primary" />
          <Badge variant="secondary" class="text-[10px] uppercase tracking-wider">Invitación al pool de jurados</Badge>
        </div>
        <CardTitle class="text-2xl">{{ organization?.name || 'Organización' }}</CardTitle>
        <CardDescription v-if="organization?.name">
          Te han invitado a formar parte del <strong>pool de jurados</strong> de {{ organization.name }}.
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-5">
        <!-- Already accepted -->
        <div v-if="invitation.status === 'accepted'" class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div class="flex items-center gap-2 text-emerald-700 font-semibold">
            <CheckCircle2 class="h-4 w-4" />
            <span>Ya aceptaste esta invitación</span>
          </div>
          <p class="text-emerald-700/80 mt-1">Ahora formas parte del pool de jurados y puedes ser asignado a concursos.</p>
          <NuxtLink to="/dashboard" class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800">
            Ir al panel <ArrowRight class="h-3.5 w-3.5" />
          </NuxtLink>
        </div>

        <!-- Already rejected -->
        <div v-else-if="invitation.status === 'rejected'" class="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          <div class="flex items-center gap-2 font-semibold">
            <XCircle class="h-4 w-4" />
            <span>Has rechazado esta invitación</span>
          </div>
          <p class="text-zinc-600 mt-1">Si fue un error, pide a la organización que te invite de nuevo.</p>
        </div>

        <!-- Pending: not authenticated -->
        <template v-else-if="!isAuthed">
          <div class="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
            <div class="flex items-center gap-2 font-medium">
              <Mail class="h-4 w-4" />
              <span>Inicia sesión para responder</span>
            </div>
            <p class="text-muted-foreground">
              La invitación se envió a <strong>{{ invitation.email }}</strong>. Entra con esa cuenta para aceptar o rechazar.
            </p>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <Button as-child class="flex-1">
              <NuxtLink :to="loginHref">Iniciar sesión</NuxtLink>
            </Button>
            <Button as-child variant="outline" class="flex-1">
              <NuxtLink :to="signupHref">Crear cuenta</NuxtLink>
            </Button>
          </div>
        </template>

        <!-- Pending: authenticated but wrong email -->
        <template v-else-if="!emailMatches">
          <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p class="font-medium">Esta invitación es para otro correo</p>
            <p class="mt-1 text-amber-800/80">
              Has iniciado sesión como <strong>{{ userEmail }}</strong>, pero la invitación se envió a <strong>{{ inviteEmail }}</strong>.
              Cierra sesión y entra con la cuenta correcta para responder.
            </p>
          </div>
          <Button variant="outline" class="w-full" @click="authStore.signOut()">Cerrar sesión</Button>
        </template>

        <!-- Pending: authenticated & email matches → action buttons -->
        <template v-else>
          <p class="text-sm text-muted-foreground">
            Acepta para unirte al pool de jurados de esta organización y poder ser asignado a sus concursos.
          </p>
          <div class="flex flex-col sm:flex-row gap-2">
            <Button
              class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              :disabled="responding"
              @click="respond('accept')"
            >
              <Loader2 v-if="responding" class="h-4 w-4 animate-spin mr-2" />
              Aceptar invitación
            </Button>
            <Button
              variant="outline"
              class="flex-1"
              :disabled="responding"
              @click="respond('reject')"
            >
              Rechazar
            </Button>
          </div>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
