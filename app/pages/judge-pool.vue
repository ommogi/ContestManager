<script setup lang="ts">
import { ref, computed } from 'vue'
import AvatarBubble from '@/components/ui/avatar/AvatarBubble.vue'
import { Plus, Users, Trash2, Mail, GraduationCap, Search, ChevronUp, ChevronDown, ArrowUpDown, Clock, RotateCcw, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'vue-sonner'
import { useJudgePoolStore } from '~/stores/judge-pool'
import { storeToRefs } from 'pinia'

const store = useJudgePoolStore()
const { items: judgePool, invitations, isFetching, total, pendingInvitations } = storeToRefs(store)

await useAsyncData('judge-pool', () => store.fetchPool())

const isInviting = ref(false)
const searchQuery = ref('')
const isDialogOpen = ref(false)
const sortField = ref<string>('full_name')
const sortDirection = ref<'asc' | 'desc'>('asc')

const newJudge = ref({ email: '', full_name: '', specialty: '' })

function toggleSort(field: string) {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDirection.value = 'asc'
  }
}

const filteredJudges = computed(() => {
  let list = judgePool.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(j =>
      j.full_name?.toLowerCase().includes(q) ||
      j.email?.toLowerCase().includes(q) ||
      j.specialty?.toLowerCase().includes(q)
    )
  }
  return [...list].sort((a: any, b: any) => {
    const aVal = a[sortField.value]?.toLowerCase() || ''
    const bVal = b[sortField.value]?.toLowerCase() || ''
    if (aVal < bVal) return sortDirection.value === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection.value === 'asc' ? 1 : -1
    return 0
  })
})

async function handleInviteJudge() {
  if (!newJudge.value.email) {
    toast.error('Introduce el correo electrónico')
    return
  }
  isInviting.value = true
  try {
    await store.inviteJudge(newJudge.value)
    toast.success('Invitación enviada con éxito')
    newJudge.value = { email: '', full_name: '', specialty: '' }
    isDialogOpen.value = false
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'Hubo un error al enviar la invitación')
  } finally {
    isInviting.value = false
  }
}

const showDeleteJudgeDialog = ref(false)
const deletingJudgeId = ref<string | null>(null)

function requestDeleteJudge(id: string) {
  deletingJudgeId.value = id
  showDeleteJudgeDialog.value = true
}

async function confirmDeleteJudge() {
  if (!deletingJudgeId.value) return
  showDeleteJudgeDialog.value = false
  try {
    await store.removeJudge(deletingJudgeId.value)
    toast.success('Jurado eliminado correctamente')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo eliminar al jurado')
  } finally {
    deletingJudgeId.value = null
  }
}

async function handleResendInvitation(invitationId: string) {
  try {
    await store.resendInvitation(invitationId)
    toast.success('Invitación reenviada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo reenviar la invitación')
  }
}

async function handleCancelInvitation(invitationId: string) {
  try {
    await store.cancelInvitation(invitationId)
    toast.success('Invitación cancelada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cancelar la invitación')
  }
}
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header -->
    <div class="space-y-1">
      <h1 class="text-3xl font-bold tracking-tight">Pool de Jurados</h1>
      <p class="text-muted-foreground">Gestiona la base de datos de jueces de tu organización para asignarlos a concursos.</p>
    </div>

    <Card class="border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden bg-transparent">
      <CardHeader class="pb-3 border-b border-zinc-200 dark:border-zinc-800 bg-muted/50">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Miembros del Pool</CardTitle>
            <CardDescription>
              {{ total }} confirmados · {{ pendingInvitations.length }} invitación{{ pendingInvitations.length === 1 ? '' : 'es' }} pendiente{{ pendingInvitations.length === 1 ? '' : 's' }}
            </CardDescription>
          </div>
          <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div class="relative w-full sm:w-64">
              <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar jurado..."
                v-model="searchQuery"
                class="pl-9 h-9 bg-background/50 border border-zinc-200 dark:border-zinc-700 focus-visible:ring-zinc-900"
              />
            </div>

            <Dialog v-model:open="isDialogOpen">
              <DialogTrigger as-child>
                <Button size="sm" class="gap-2 bg-card text-foreground border-border border-2 rounded-md transition-all font-bold uppercase tracking-tight text-[10px] px-6 shadow-sm hover:bg-muted">
                  <Plus class="w-4 h-4" />
                  Invitar Jurado
                </Button>
              </DialogTrigger>
              <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Invitar Jurado</DialogTitle>
                  <DialogDescription>Introduce los datos. El jurado recibirá una invitación por correo para aceptar o rechazar.</DialogDescription>
                </DialogHeader>
                <div class="grid gap-6 py-4">
                  <div class="space-y-2">
                    <Label for="email" class="text-sm font-bold">Correo Electrónico</Label>
                    <Input id="email" type="email" v-model="newJudge.email" placeholder="juan@ejemplo.com" />
                  </div>
                  <div class="space-y-2">
                    <Label for="full_name" class="text-sm font-bold">Nombre <span class="text-zinc-400 font-normal text-xs">(opcional)</span></Label>
                    <Input id="full_name" v-model="newJudge.full_name" placeholder="Juan Pérez" />
                  </div>
                  <div class="space-y-2">
                    <Label for="specialty" class="text-sm font-bold">Especialidad <span class="text-zinc-400 font-normal text-xs">(opcional)</span></Label>
                    <Input id="specialty" v-model="newJudge.specialty" placeholder="Ej. Técnica Vocal, Jazz, etc." />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" @click="isDialogOpen = false">Cancelar</Button>
                  <Button :disabled="isInviting" @click="handleInviteJudge">
                    {{ isInviting ? 'Enviando...' : 'Enviar Invitación' }}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent class="p-0">
        <div v-if="isFetching" class="p-12 flex flex-col items-center justify-center gap-4">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-zinc-900 border-t-transparent" />
          <p class="text-muted-foreground animate-pulse">Cargando jurados...</p>
        </div>

        <div v-else-if="filteredJudges.length === 0 && pendingInvitations.length === 0" class="p-12 text-center space-y-4">
          <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto text-muted-foreground border-2 border-dashed">
            <Users class="w-8 h-8" />
          </div>
          <div>
            <h3 class="text-lg font-semibold">No se encontraron jurados</h3>
            <p class="text-muted-foreground">Comienza invitando a tu primer jurado al pool para usarlo en tus concursos.</p>
          </div>
          <Button size="sm" @click="isDialogOpen = true" class="mt-2 gap-2 bg-card text-foreground border-border border-2 rounded-md font-bold uppercase tracking-tight text-[10px] px-6 shadow-sm hover:bg-muted">
            <Plus class="w-4 h-4" />
            Invitar mi primer jurado
          </Button>
        </div>

        <!-- Pending invitations section -->
        <div v-if="pendingInvitations.length > 0" class="border-b border-zinc-200 dark:border-zinc-800">
          <div class="px-6 py-3 bg-amber-50/50 dark:bg-amber-950/20 border-b border-zinc-100 dark:border-zinc-900">
            <h3 class="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Clock class="w-3.5 h-3.5" />
              Invitaciones Pendientes
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow class="!bg-muted/30 hover:!bg-muted/30 border-b border-zinc-200 dark:border-zinc-800">
                <TableHead class="px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px]">Nombre</TableHead>
                <TableHead class="px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px]">Email</TableHead>
                <TableHead class="px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px]">Especialidad</TableHead>
                <TableHead class="px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px]">Estado</TableHead>
                <TableHead class="text-right px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="inv in pendingInvitations"
                :key="inv.id"
                class="group transition-colors border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <TableCell class="font-medium px-6 py-4">
                  <div class="flex items-center gap-3">
                    <AvatarBubble
                      :name="inv.full_name || '??'"
                      :avatar-url="null"
                      size="w-9 h-9"
                      text-size="text-xs"
                    />
                    <span>{{ inv.full_name || '—' }}</span>
                  </div>
                </TableCell>
                <TableCell class="px-6">
                  <div class="flex items-center gap-2 text-muted-foreground">
                    <Mail class="w-4 h-4 shrink-0" />
                    {{ inv.email || '—' }}
                  </div>
                </TableCell>
                <TableCell class="px-6">
                  <span v-if="inv.specialty" class="text-sm border px-2 py-0.5 rounded-full bg-zinc-50 dark:bg-zinc-900 font-medium">{{ inv.specialty }}</span>
                  <span v-else class="text-xs text-muted-foreground italic">No especificada</span>
                </TableCell>
                <TableCell class="px-6">
                  <span class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    <Clock class="w-3 h-3" />
                    Pendiente
                  </span>
                </TableCell>
                <TableCell class="text-right px-6">
                  <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all"
                      title="Reenviar invitación"
                      @click="handleResendInvitation(inv.id)"
                    >
                      <RotateCcw class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                      title="Cancelar invitación"
                      @click="handleCancelInvitation(inv.id)"
                    >
                      <X class="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- Confirmed judges section -->
        <Table v-if="filteredJudges.length > 0">
          <TableHeader>
            <TableRow class="!bg-muted/50 hover:!bg-muted/50 border-b border-zinc-200 dark:border-zinc-800">
              <TableHead class="w-[300px] px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px] cursor-pointer" @click="toggleSort('full_name')">
                <div class="flex items-center gap-1">
                  Nombre
                  <component :is="sortField === 'full_name' ? (sortDirection === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown" class="h-3.5 w-3.5 opacity-70" />
                </div>
              </TableHead>
              <TableHead class="px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px] cursor-pointer" @click="toggleSort('email')">
                <div class="flex items-center gap-1">
                  Email
                  <component :is="sortField === 'email' ? (sortDirection === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown" class="h-3.5 w-3.5 opacity-70" />
                </div>
              </TableHead>
              <TableHead class="px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px] cursor-pointer" @click="toggleSort('specialty')">
                <div class="flex items-center gap-1">
                  Especialidad
                  <component :is="sortField === 'specialty' ? (sortDirection === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown" class="h-3.5 w-3.5 opacity-70" />
                </div>
              </TableHead>
              <TableHead class="text-right px-6 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-tighter text-[11px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="judge in filteredJudges"
              :key="judge.id"
              class="group transition-colors border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            >
              <TableCell class="font-medium px-6 py-4">
                <div class="flex items-center gap-3">
                  <AvatarBubble
                    :name="judge.full_name || '??'"
                    :avatar-url="judge.avatar_url ?? null"
                    size="w-9 h-9"
                    text-size="text-xs"
                  />
                  <span>{{ judge.full_name || '—' }}</span>
                </div>
              </TableCell>
              <TableCell class="px-6">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <Mail class="w-4 h-4 shrink-0" />
                  {{ judge.email || '—' }}
                </div>
              </TableCell>
              <TableCell class="px-6">
                <div v-if="judge.specialty" class="flex items-center gap-2">
                  <GraduationCap class="w-4 h-4 text-zinc-400" />
                  <span class="text-sm border px-2 py-0.5 rounded-full bg-zinc-50 dark:bg-zinc-900 font-medium">{{ judge.specialty }}</span>
                </div>
                <span v-else class="text-xs text-muted-foreground italic">No especificada</span>
              </TableCell>
              <TableCell class="text-right px-6">
                <Button
                  variant="ghost"
                  size="icon"
                  class="text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all opacity-0 group-hover:opacity-100"
                  @click="requestDeleteJudge(judge.id)"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Delete judge dialog -->
    <AlertDialog v-model:open="showDeleteJudgeDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar jurado</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que quieres eliminar a este jurado del pool? Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction @click="confirmDeleteJudge">Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
