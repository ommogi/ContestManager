<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronsUpDown, Check, Search } from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { COUNTRIES, findCountryByCode, findCountryByName } from '@/utils/countries'

// modelValue is the country NAME (es) — keeps DB schema as-is.
const props = defineProps<{
  modelValue?: string | null
  placeholder?: string
  class?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const open = ref(false)
const search = ref('')

const current = computed(() =>
  findCountryByName(props.modelValue || '') || findCountryByCode(props.modelValue || '')
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return COUNTRIES
  return COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.code.toLowerCase().includes(q)
  )
})

function pick(name: string) {
  emit('update:modelValue', name)
  search.value = ''
  open.value = false
}

watch(open, (v) => { if (!v) search.value = '' })
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex items-center justify-between gap-2 h-9 w-full px-3 rounded-md border border-input bg-background hover:bg-accent text-sm text-left"
        :class="props.class"
      >
        <span v-if="current" class="flex items-center gap-2 truncate">
          <span class="text-base leading-none">{{ current.flag }}</span>
          <span class="truncate">{{ current.name }}</span>
        </span>
        <span v-else class="text-muted-foreground">{{ props.placeholder ?? 'Selecciona país…' }}</span>
        <ChevronsUpDown class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-[var(--reka-popper-anchor-width)] p-0" align="start">
      <div class="flex items-center gap-2 px-3 py-2 border-b">
        <Search class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          v-model="search"
          type="text"
          placeholder="Buscar país…"
          class="flex-1 bg-transparent outline-none text-sm"
        />
      </div>
      <div class="max-h-64 overflow-y-auto py-1">
        <button
          v-for="c in filtered"
          :key="c.code"
          type="button"
          class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-sm text-left"
          @click="pick(c.name)"
        >
          <span class="text-base leading-none">{{ c.flag }}</span>
          <span class="flex-1 truncate">{{ c.name }}</span>
          <Check v-if="current?.code === c.code" class="w-3.5 h-3.5 text-primary" />
        </button>
        <div v-if="!filtered.length" class="px-3 py-4 text-center text-xs text-muted-foreground">
          Sin resultados
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
