<script setup lang="ts">
import { ref, computed } from 'vue'
import { generatedAvatarUri } from '~~/shared/avatar'

const props = defineProps<{
  name: string
  avatarUrl?: string | null
  size?: string
  /**
   * Ya no se usa: el respaldo era texto con iniciales y ahora es una imagen.
   * Se mantiene declarada porque cinco llamadas siguen pasando `text-size`, y
   * una prop no declarada se colaría al DOM como atributo suelto. Quitarla
   * obliga a tocar esas cinco páginas, varias en manos de otra rama.
   */
  textSize?: string
}>()

const lightboxOpen = ref(false)

/**
 * Avatar generado para quien no ha subido foto. Determinista: el mismo nombre
 * da siempre la misma imagen, así que sirve para reconocer a alguien de una
 * fila a otra.
 *
 * En `computed` y no en el template a propósito: ronda los 3 kB por avatar y en
 * una tabla larga no conviene recalcularlo en cada render.
 */
const fallbackAvatar = computed(() => generatedAvatarUri(props.name))

const sizeClass = computed(() => props.size ?? 'w-8 h-8')
</script>

<template>
  <div
    class="relative group shrink-0 rounded-lg border-2 border-zinc-100 dark:border-zinc-800 overflow-hidden bg-zinc-200 dark:bg-zinc-700"
    :class="[sizeClass, avatarUrl ? 'cursor-zoom-in' : '']"
    @click.stop="avatarUrl && (lightboxOpen = true)"
  >
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      :alt="name"
      class="h-full w-full object-cover"
    />
    <!--
      Sin foto: avatar generado del nombre. El `alt` se deja vacío porque la
      imagen no aporta información propia — el nombre ya está en la fila, y
      leerlo dos veces solo estorba a quien use lector de pantalla.
    -->
    <img
      v-else
      :src="fallbackAvatar"
      alt=""
      aria-hidden="true"
      class="h-full w-full object-cover"
    />
    <div
      v-if="avatarUrl"
      class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
    >
      <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <Transition name="ab-fade">
        <div
          v-if="lightboxOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          @click="lightboxOpen = false"
        >
          <img
            :src="avatarUrl ?? ''"
            :alt="name"
            class="rounded-2xl max-w-[320px] max-h-[320px] object-cover"
            @click.stop
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ab-fade-enter-active, .ab-fade-leave-active { transition: opacity 0.15s ease; }
.ab-fade-enter-from, .ab-fade-leave-to { opacity: 0; }
</style>
