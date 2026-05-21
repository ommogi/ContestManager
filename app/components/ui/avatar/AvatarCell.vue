<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  name: string
  email?: string | null
  avatarUrl?: string | null
  size?: 'sm' | 'md'
}>()

const lightboxOpen = ref(false)

const initials = computed(() =>
  (props.name || '')
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
)

const sizeClass = computed(() => props.size === 'md' ? 'h-10 w-10' : 'h-8 w-8')
</script>

<template>
  <div class="flex items-center gap-3 py-1">
    <!-- Avatar bubble -->
    <div
      class="relative group shrink-0 rounded-lg border-2 border-zinc-100 dark:border-zinc-800 overflow-hidden bg-zinc-100 dark:bg-zinc-900"
      :class="[sizeClass, avatarUrl ? 'cursor-zoom-in' : '']"
      @click.stop="avatarUrl && (lightboxOpen = true)"
    >
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        :alt="name"
        class="h-full w-full object-cover"
      />
      <div
        v-else
        class="h-full w-full flex items-center justify-center text-[10px] font-bold text-zinc-700 dark:text-zinc-300"
      >
        {{ initials }}
      </div>
      <div
        v-if="avatarUrl"
        class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      </div>
    </div>

    <!-- Text -->
    <div class="flex flex-col min-w-0">
      <span class="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight truncate">{{ name || '—' }}</span>
      <span v-if="email" class="text-[10px] text-zinc-400 font-medium truncate max-w-[160px]">{{ email }}</span>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <Transition name="avatar-fade">
        <div
          v-if="lightboxOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          @click="lightboxOpen = false"
        >
          <img
            :src="avatarUrl ?? ''"
            :alt="name"
            class="rounded-2xl max-w-[320px] max-h-[320px] object-cover shadow-2xl"
            @click.stop
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.avatar-fade-enter-active, .avatar-fade-leave-active { transition: opacity 0.15s ease; }
.avatar-fade-enter-from, .avatar-fade-leave-to { opacity: 0; }
</style>
