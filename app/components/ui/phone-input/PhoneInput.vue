<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ChevronDown, Check, Search } from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DIAL_COUNTRIES as COUNTRIES, formatPhone, splitE164, joinE164, getPhoneMaxLength } from '@/utils/countries'
import { cn } from '@/utils'

const props = defineProps<{
  modelValue?: string | null   // E.164 string (e.g. +34600112233) or empty
  defaultDial?: string         // fallback prefix when modelValue empty
  placeholder?: string
  class?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const inputRef = ref<HTMLInputElement | null>(null)

const initial = splitE164(props.modelValue || '', props.defaultDial || '34')
const dial  = ref(initial.dial)
const local = ref(formatPhone(initial.local, initial.dial))

watch(() => props.modelValue, (v) => {
  const p = splitE164(v || '', props.defaultDial || '34')
  if (p.dial !== dial.value) dial.value = p.dial
  const incoming = p.local
  const current = local.value.replace(/\D/g, '')
  if (incoming !== current) {
    local.value = formatPhone(incoming, dial.value)
  }
})

function onKeydown(e: KeyboardEvent) {
  if (!/^\d$/.test(e.key)) return
  const maxLen = getPhoneMaxLength(dial.value)
  const current = local.value.replace(/\D/g, '')
  if (current.length >= maxLen) e.preventDefault()
}

function onLocalInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const maxLen = getPhoneMaxLength(dial.value)
  const digits = raw.replace(/\D/g, '').slice(0, maxLen)
  local.value = formatPhone(digits, dial.value)
  emit('update:modelValue', joinE164(dial.value, digits))
}

function setDial(d: string) {
  dial.value = d
  search.value = ''
  const digits = local.value.replace(/\D/g, '').slice(0, getPhoneMaxLength(d))
  local.value = formatPhone(digits, d)
  nextTick(() => {
    open.value = false
    emit('update:modelValue', joinE164(d, digits))
    inputRef.value?.focus()
  })
}

const open = ref(false)
const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return COUNTRIES
  return COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.code.toLowerCase().includes(q) ||
    c.dial.includes(q)
  )
})
const currentCountry = computed(() => COUNTRIES.find(c => c.dial === dial.value) || COUNTRIES[0])
</script>

<template>
  <div class="flex" :class="props.class">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex items-center gap-1.5 h-9 px-2.5 border border-input rounded-l-md bg-background hover:bg-accent text-sm shrink-0 border-r-0"
        >
          <span class="text-base leading-none">{{ currentCountry?.flag }}</span>
          <span class="font-mono text-xs">+{{ dial }}</span>
          <ChevronDown class="w-3 h-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent class="w-72 p-0" align="start">
        <div class="flex items-center gap-2 px-3 py-2 border-b">
          <Search class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            v-model="search"
            type="text"
            placeholder="Buscar país o prefijo…"
            class="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <div class="max-h-64 overflow-y-auto py-1">
          <button
            v-for="c in filtered"
            :key="c.code + ':' + c.dial"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-sm text-left"
            @click="setDial(c.dial)"
          >
            <span class="text-base leading-none">{{ c.flag }}</span>
            <span class="flex-1 truncate">{{ c.name }}</span>
            <span class="font-mono text-xs text-muted-foreground">+{{ c.dial }}</span>
            <Check v-if="c.dial === dial" class="w-3.5 h-3.5 text-primary" />
          </button>
          <div v-if="!filtered.length" class="px-3 py-4 text-center text-xs text-muted-foreground">
            Sin resultados
          </div>
        </div>
      </PopoverContent>
    </Popover>
    <input
      ref="inputRef"
      :value="local"
      type="tel"
      inputmode="numeric"
      autocomplete="tel-national"
      :placeholder="props.placeholder ?? '600 11 22 33'"
      :class="cn('h-9 rounded-l-none flex-1 font-mono px-3 py-2 border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', props.class)"
      @keydown="onKeydown"
      @input="onLocalInput"
    />
  </div>
</template>
