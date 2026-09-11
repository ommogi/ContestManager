<!-- app/components/inscription/InscriptionFormTab.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { CheckCircle2, FileWarning, Loader2, Lock, Send, ShieldAlert } from 'lucide-vue-next'
import type { FormField, FormResponses } from '~/types/inscription-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { apiClient } from '@/api/apiClient'
import FormBuilder from '@/components/inscription/FormBuilder.vue'
import DynamicFormRenderer from '@/components/inscription/DynamicFormRenderer.vue'

interface Props {
  contestId: string
  /** Contest is active/finished/cancelled: the form is frozen. */
  locked?: boolean
}

const props = withDefaults(defineProps<Props>(), { locked: false })

/** Raw `inscription_form_schemas` row as the endpoints return it. */
interface FormSchemaRow {
  id: string
  contest_id: string
  version: number
  is_published: boolean
  schema_json: FormField[] | null
  created_at: string
  updated_at: string
  published_at: string | null
}

const schema = ref<FormSchemaRow | null>(null)
// Replaced by a fresh array on load and after every save; the builder treats
// each new reference as a new baseline, which is what clears the dirty flag.
const builderFields = ref<FormField[]>([])
const loading = ref(true)
const saving = ref(false)
const publishing = ref(false)
const forbidden = ref(false)
const isDirty = ref(false)

const previewOpen = ref(false)
const previewFields = ref<FormField[]>([])
const previewResponses = ref<FormResponses>({})

const isPublished = computed(() => schema.value?.is_published === true)
const hasSavedSchema = computed(() => schema.value !== null)
const busy = computed(() => saving.value || publishing.value)

const publishedAtLabel = computed(() => {
  const raw = schema.value?.published_at
  if (!raw) return null
  return new Date(raw).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
})

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback
  const e = error as {
    statusMessage?: string
    message?: string
    data?: { statusMessage?: string, message?: string }
  }
  return e.data?.statusMessage || e.data?.message || e.statusMessage || fallback
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  return (error as { statusCode?: number, status?: number }).statusCode
    ?? (error as { status?: number }).status
}

async function load() {
  loading.value = true
  forbidden.value = false
  try {
    const row = await apiClient<FormSchemaRow | null>(
      `/api/contests/${props.contestId}/form-schema`
    )
    schema.value = row
    // No schema yet is a normal starting state, not an error.
    builderFields.value = row?.schema_json ?? []
  } catch (error) {
    const code = statusCode(error)
    if (code === 401 || code === 403) {
      forbidden.value = true
    } else {
      toast.error(errorMessage(error, 'No se pudo cargar el formulario'))
    }
  } finally {
    loading.value = false
  }
}

async function handleSave(fields: FormField[]) {
  if (props.locked) return
  saving.value = true
  try {
    const row = await apiClient<FormSchemaRow>(
      `/api/contests/${props.contestId}/form-schema`,
      { method: 'POST', body: { fields } }
    )
    schema.value = row
    builderFields.value = row.schema_json ?? []
    toast.success(`Formulario guardado · versión ${row.version}`)
  } catch (error) {
    toast.error(errorMessage(error, 'No se pudo guardar el formulario'))
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  if (props.locked) return
  // The endpoint always publishes the highest version, so publishing with
  // unsaved edits would put an older draft live.
  if (isDirty.value) {
    toast.warning('Guarda los cambios antes de publicar', {
      description: 'Se publicaría la última versión guardada, no lo que ves en pantalla.'
    })
    return
  }
  if (!hasSavedSchema.value) {
    toast.warning('Guarda el formulario antes de publicarlo')
    return
  }

  publishing.value = true
  try {
    await apiClient(`/api/contests/${props.contestId}/form-schema.publish`, {
      method: 'POST',
      body: {}
    })
    await load()
    toast.success('Formulario publicado')
  } catch (error) {
    toast.error(errorMessage(error, 'No se pudo publicar el formulario'))
  } finally {
    publishing.value = false
  }
}

function handlePreview(fields: FormField[]) {
  previewFields.value = [...fields]
  previewOpen.value = !previewOpen.value
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <!-- Loading -->
    <Card v-if="loading" class="border-2 border-dashed bg-muted/30 py-12">
      <CardContent class="flex flex-col items-center gap-2 text-center">
        <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
        <p class="text-sm text-muted-foreground">
          Cargando formulario…
        </p>
      </CardContent>
    </Card>

    <!-- No permission: the server gate already rejected us -->
    <Card v-else-if="forbidden" class="border-2 border-dashed bg-muted/30 py-12">
      <CardContent class="flex flex-col items-center gap-2 text-center">
        <ShieldAlert class="w-8 h-8 text-muted-foreground/60" />
        <p class="text-sm font-bold">
          No tienes permiso para editar este formulario
        </p>
        <p class="text-xs text-muted-foreground">
          Solo la organización propietaria del concurso puede configurarlo.
        </p>
      </CardContent>
    </Card>

    <template v-else>
      <!-- Status + publish -->
      <Card class="border-2">
        <CardHeader class="pb-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="space-y-1">
              <CardTitle class="text-base flex items-center gap-2">
                Formulario de inscripción
                <Badge :variant="isPublished ? 'default' : 'secondary'" class="uppercase tracking-widest text-[10px]">
                  {{ isPublished ? 'Publicado' : 'Borrador' }}
                </Badge>
              </CardTitle>
              <p class="text-xs text-muted-foreground">
                <template v-if="!hasSavedSchema">
                  Todavía no has guardado ninguna versión.
                </template>
                <template v-else-if="isPublished && publishedAtLabel">
                  Versión {{ schema?.version }} · publicada el {{ publishedAtLabel }}
                </template>
                <template v-else>
                  Versión {{ schema?.version }} · sin publicar
                </template>
              </p>
            </div>

            <Button
              size="sm"
              class="gap-2 font-bold uppercase tracking-widest text-[10px]"
              :disabled="locked || busy || !hasSavedSchema"
              @click="handlePublish"
            >
              <Loader2 v-if="publishing" class="w-3.5 h-3.5 animate-spin" />
              <Send v-else class="w-3.5 h-3.5" />
              Publicar
            </Button>
          </div>
        </CardHeader>

        <CardContent v-if="locked || isDirty || (!isPublished && hasSavedSchema)" class="pt-0">
          <div
            v-if="locked"
            class="rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center gap-3"
          >
            <Lock class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p class="text-sm text-amber-800 dark:text-amber-300">
              El concurso ya no admite inscripciones: el formulario está bloqueado.
            </p>
          </div>
          <div
            v-else-if="isDirty"
            class="rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center gap-3"
          >
            <FileWarning class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p class="text-sm text-amber-800 dark:text-amber-300">
              Tienes cambios sin guardar. Guárdalos antes de publicar o se publicará la última versión guardada.
            </p>
          </div>
          <div
            v-else
            class="rounded-xl border-2 border-dashed px-4 py-3 flex items-center gap-3"
          >
            <CheckCircle2 class="w-4 h-4 text-muted-foreground shrink-0" />
            <p class="text-sm text-muted-foreground">
              La versión {{ schema?.version }} está guardada pero aún no es visible para los participantes.
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Builder -->
      <FormBuilder
        :initial-fields="builderFields"
        :disabled="locked || busy"
        @save="handleSave"
        @preview="handlePreview"
        @update:dirty="isDirty = $event"
      />

      <!-- Preview -->
      <Card v-if="previewOpen" class="border-2">
        <CardHeader class="pb-3">
          <CardTitle class="text-base">
            Vista previa
          </CardTitle>
          <p class="text-xs text-muted-foreground">
            Así verán el formulario los participantes. Los campos no son editables aquí.
          </p>
        </CardHeader>
        <CardContent>
          <p v-if="previewFields.length === 0" class="text-sm text-muted-foreground text-center py-6">
            No hay campos que previsualizar.
          </p>
          <DynamicFormRenderer
            v-else
            v-model="previewResponses"
            :fields="previewFields"
            disabled
          />
        </CardContent>
      </Card>
    </template>
  </div>
</template>
