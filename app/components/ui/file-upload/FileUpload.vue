<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Upload, X, Image, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils'
import { objectPathFromPublicUrl } from '~~/shared/storage-path'
import { resizeImageFile, LOGO_POLICY } from '@/utils/image-resize'

/** Every object this component writes lives here. */
const BUCKET = 'org_logos'

interface Props {
  modelValue?: string | null
  accept?: string
  maxSizeMB?: number
  disabled?: boolean
  placeholder?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  // No SVG: an SVG is a document that can carry script and these objects are
  // served from a public URL. `allowed_mime_types` on the bucket says the same
  // thing (0059), so offering it here would only produce a rejected upload.
  accept: 'image/png,image/jpeg,image/webp',
  maxSizeMB: 5,
  disabled: false,
  placeholder: 'Arrastra una imagen o haz clic para subir',
  class: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  'upload:start': []
  'upload:complete': [url: string]
  'upload:error': [error: string]
}>()

const isDragging = ref(false)
const uploading = ref(false)
const previewUrl = ref<string | null>(props.modelValue ?? null)
const inputRef = ref<HTMLInputElement | null>(null)
const errorMessage = ref<string | null>(null)

watch(() => props.modelValue, (val) => {
  previewUrl.value = val ?? null
})

const isImage = computed(() => {
  if (!previewUrl.value) return false
  return /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(previewUrl.value)
})

function triggerInput() {
  if (!props.disabled) {
    inputRef.value?.click()
  }
}

async function handleFile(file: File) {
  errorMessage.value = null

  // Validate file type
  const validTypes = props.accept.split(',').map(t => t.trim())
  if (!validTypes.some(t => file.type.includes(t.replace('image/', '')))) {
    errorMessage.value = 'Tipo de archivo no válido. Solo PNG, JPG o SVG.'
    emit('upload:error', errorMessage.value)
    return
  }
  
  // Validate file size
  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > props.maxSizeMB) {
    errorMessage.value = `El archivo es demasiado grande. Máximo ${props.maxSizeMB}MB.`
    emit('upload:error', errorMessage.value)
    return
  }
  
  // Shrink after the checks and before anything else. The checks run on what
  // the user actually picked — telling them their 8 MB file is too big is
  // honest; silently shrinking it under the limit and accepting it is not.
  //
  // The format is kept: an organization logo's transparency is usually
  // load-bearing, so only the resolution comes down. Never throws — a failure
  // returns the original rather than blocking the upload.
  emit('upload:start')
  uploading.value = true
  const { file: upload, mimeType, extension } = await resizeImageFile(file, LOGO_POLICY)

  // Create local preview of what will actually be stored
  previewUrl.value = URL.createObjectURL(upload)
  
  try {
    const nuxtApp = useNuxtApp()
    const supabase = nuxtApp.$supabase as any

    // The object goes in the uploader's own folder, which is what the bucket's
    // policies check (0059). It used to be `onboarding/<timestamp>-<random>`,
    // outside anyone's namespace, so the policy meant to let an owner manage
    // their logo could never match and nothing could ever be deleted.
    //
    // Namespaced by user and not by organization on purpose: this runs during
    // onboarding, before the organization row exists, so there is no
    // organization id to use yet.
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) throw new Error('Debes iniciar sesión para subir una imagen.')

    // The previous object, resolved before the new one replaces it in the model.
    const previousPath = objectPathFromPublicUrl(props.modelValue, BUCKET)

    // Extension and content type follow the bytes that are actually sent, not
    // the ones that were picked: `org_logos` declares `allowed_mime_types`
    // (0059), so a mismatched label is refused by the bucket.
    const path = `${userId}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, upload, { upsert: true, contentType: mimeType })

    if (uploadError) throw uploadError

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)

    const publicUrl = urlData.publicUrl

    // Update parent
    emit('update:modelValue', publicUrl)
    emit('upload:complete', publicUrl)

    // Drop the one it replaced. After the new URL is published, and never
    // before: a failure here costs one stale object, while the other order
    // would delete the logo the page is still showing. Best-effort by design —
    // the upload succeeded, so surfacing a cleanup error would report the wrong
    // outcome. Guarded on a different path so re-uploading cannot delete what
    // was just written.
    if (previousPath && previousPath !== path) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([previousPath])
      if (removeError) {
        console.warn(`[file-upload] previous object left behind: ${previousPath}`, removeError.message)
      }
    }
  } catch (error: any) {
    console.error('Upload error:', error)
    errorMessage.value = error?.message || 'Error al subir la imagen'
    emit('upload:error', errorMessage.value)
    previewUrl.value = null
  } finally {
    uploading.value = false
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  
  if (props.disabled || !e.dataTransfer?.files.length) return
  
  const file = e.dataTransfer.files[0]
  handleFile(file)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (!props.disabled) {
    isDragging.value = true
  }
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    handleFile(file)
  }
  // Reset input so same file can be selected again
  if (inputRef.value) {
    inputRef.value.value = ''
  }
}

function removeImage() {
  previewUrl.value = null
  emit('update:modelValue', null)
  errorMessage.value = null
}
</script>

<template>
  <div :class="cn('space-y-2', props.class)">
    <!-- Upload Area -->
    <div
      v-if="!previewUrl"
      :class="cn(
        'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer hover:border-primary/50 hover:bg-primary/5'
      )"
      @click="triggerInput"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
    >
      <input
        ref="inputRef"
        type="file"
        :accept="accept"
        :disabled="disabled"
        class="hidden"
        @change="onFileSelect"
      />
      
      <div class="flex flex-col items-center gap-3">
        <div :class="cn(
          'flex h-12 w-12 items-center justify-center rounded-full',
          isDragging ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )">
          <Upload v-if="!uploading" class="h-6 w-6" />
          <Loader2 v-else class="h-6 w-6 animate-spin" />
        </div>
        
        <div class="space-y-1">
          <p class="text-sm font-medium">
            {{ uploading ? 'Subiendo...' : placeholder }}
          </p>
          <p class="text-xs text-muted-foreground">
            PNG, JPG o SVG hasta {{ maxSizeMB }}MB
          </p>
        </div>
      </div>
    </div>
    
    <!-- Preview -->
    <div v-else class="relative group">
      <div class="relative overflow-hidden rounded-lg border bg-muted">
        <img
          v-if="isImage"
          :src="previewUrl"
          alt="Preview"
          class="h-48 w-full object-cover"
        />
        <div v-else class="h-48 w-full flex items-center justify-center">
          <Image class="h-12 w-12 text-muted-foreground" />
        </div>
        
        <!-- Loading Overlay -->
        <div
          v-if="uploading"
          class="absolute inset-0 bg-black/50 flex items-center justify-center"
        >
          <Loader2 class="h-8 w-8 animate-spin text-white" />
        </div>
      </div>
      
      <!-- Remove Button -->
      <Button
        v-if="!uploading && !disabled"
        type="button"
        variant="destructive"
        size="icon"
        class="absolute top-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        @click.stop="removeImage"
      >
        <X class="h-4 w-4" />
      </Button>
    </div>
    
    <!-- Error Message -->
    <p v-if="errorMessage" class="text-sm text-destructive">
      {{ errorMessage }}
    </p>
  </div>
</template>
