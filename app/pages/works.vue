<script setup lang="ts">
// Catalogue of works of the organisation (KAN-16): what participants' repertoire
// (KAN-17) and the printed programmes (KAN-21/22) will pick from.
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { Plus, Search, Music2, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import WorkDialog from '@/components/works/WorkDialog.vue'
import { useWorksCatalogStore, type CatalogWork } from '~/stores/works-catalog'
import { formatDuration } from '~~/shared/works-catalog'

useHead({ title: 'Obras' })

const store = useWorksCatalogStore()
const { works, isFetching, includeArchived } = storeToRefs(store)

const search = ref('')
const isDialogOpen = ref(false)
const editing = ref<CatalogWork | null>(null)
const pendingDelete = ref<CatalogWork | null>(null)

await useAsyncData('works-catalog', () => store.fetchAll().then(() => true))

// Search runs on the server, which ignores accents the same way the database does.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch([search, includeArchived], () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    store.fetchAll(search.value).catch(() => toast.error('No se ha podido cargar el catálogo'))
  }, 250)
})

function openNew() {
  editing.value = null
  isDialogOpen.value = true
}

function openEdit(work: CatalogWork) {
  editing.value = work
  isDialogOpen.value = true
}

async function toggleArchived(work: CatalogWork) {
  try {
    await store.setWorkArchived(work.id, !work.archived_at)
    toast.success(work.archived_at ? 'Obra restaurada' : 'Obra archivada')
  } catch {
    toast.error('No se ha podido actualizar la obra')
  }
}

async function confirmDelete() {
  const work = pendingDelete.value
  pendingDelete.value = null
  if (!work) return
  try {
    const result = await store.removeWork(work.id)
    toast.success(result.archived
      ? 'La obra está en uso: se ha archivado en lugar de borrarla'
      : 'Obra eliminada')
  } catch {
    toast.error('No se ha podido eliminar la obra')
  }
}
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="space-y-1">
      <h1 class="text-3xl font-bold tracking-tight">Catálogo de obras</h1>
      <p class="text-muted-foreground">
        Las obras y compositores de tu organización, escritos una sola vez para que los programas no mezclen grafías.
      </p>
    </div>

    <Card class="border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden bg-transparent">
      <CardHeader class="pb-3 border-b border-zinc-200 dark:border-zinc-800 bg-muted/50">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Obras</CardTitle>
            <CardDescription>{{ works.length }} obra{{ works.length === 1 ? '' : 's' }}{{ includeArchived ? ', incluidas las archivadas' : '' }}</CardDescription>
          </div>
          <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <label class="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              <Checkbox v-model:checked="includeArchived" />
              Mostrar archivadas
            </label>
            <div class="relative w-full sm:w-64">
              <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="search"
                type="search"
                placeholder="Compositor o título…"
                aria-label="Buscar en el catálogo"
                class="pl-9 h-9 bg-background/50"
              />
            </div>
            <Button size="sm" class="gap-2 font-bold uppercase tracking-tight text-[10px] px-6" @click="openNew">
              <Plus class="w-4 h-4" /> Nueva obra
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="pl-6">Compositor</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Catálogo</TableHead>
              <TableHead class="text-right">Duración</TableHead>
              <TableHead class="w-32 pr-6 text-right"><span class="sr-only">Acciones</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="work in works" :key="work.id" :class="work.archived_at ? 'opacity-60' : ''">
              <TableCell class="pl-6 font-semibold">{{ work.composer?.name ?? '—' }}</TableCell>
              <TableCell>
                {{ work.title }}
                <Badge v-if="work.archived_at" variant="outline" class="ml-2 text-[10px]">Archivada</Badge>
              </TableCell>
              <TableCell class="text-muted-foreground">{{ work.catalog_ref || '—' }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatDuration(work.duration_seconds) || '—' }}</TableCell>
              <TableCell class="pr-6">
                <div class="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" class="h-8 w-8" :aria-label="`Editar ${work.title}`" @click="openEdit(work)">
                    <Pencil class="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" class="h-8 w-8"
                    :aria-label="work.archived_at ? `Restaurar ${work.title}` : `Archivar ${work.title}`"
                    @click="toggleArchived(work)"
                  >
                    <ArchiveRestore v-if="work.archived_at" class="w-4 h-4" />
                    <Archive v-else class="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" class="h-8 w-8 text-red-600" :aria-label="`Eliminar ${work.title}`" @click="pendingDelete = work">
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="!isFetching && works.length === 0">
              <TableCell colspan="5" class="py-12 text-center text-muted-foreground">
                <Music2 class="w-6 h-6 mx-auto mb-2 opacity-50" />
                {{ search ? 'Ninguna obra coincide con la búsqueda.' : 'Aún no hay obras en el catálogo.' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <WorkDialog v-model:open="isDialogOpen" :work="editing" />

    <AlertDialog :open="!!pendingDelete" @update:open="(v: boolean) => { if (!v) pendingDelete = null }">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar «{{ pendingDelete?.title }}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Si algún participante ya la tiene en su repertorio, no se borrará: se archivará para que deje de ofrecerse.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction class="bg-red-600 hover:bg-red-700" @click="confirmDelete">Eliminar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
