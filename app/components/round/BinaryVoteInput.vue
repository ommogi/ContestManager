<script setup lang="ts">
// The jury's vote in a binary round (KAN-24): pasa or no pasa, nothing else.
// Stored as 1 / 0 in `scores.value`, so the control speaks numbers outwards
// and Spanish inwards.
import { computed, ref } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { BINARY_FAIL, BINARY_PASS } from '~~/shared/voting'

const model = defineModel<number | null>({ default: null })

const props = withDefaults(defineProps<{
  disabled?: boolean
  /** `sm` fits a table row; `lg` is the scoring dialog. */
  size?: 'sm' | 'lg'
}>(), { disabled: false, size: 'lg' })

const options = [
  { value: BINARY_PASS, label: 'Pasa', icon: Check },
  { value: BINARY_FAIL, label: 'No pasa', icon: X },
] as const

const isLarge = computed(() => props.size === 'lg')

// A radiogroup owns one tab stop. Before anything is chosen the first option
// takes it, so the control is reachable from the keyboard either way.
function tabIndexFor(value: number) {
  if (model.value === null) return value === options[0].value ? 0 : -1
  return model.value === value ? 0 : -1
}

const buttons = ref<HTMLButtonElement[]>([])

function select(value: number) {
  if (props.disabled) return
  model.value = value
}

function move(offset: number) {
  if (props.disabled) return
  const current = options.findIndex(o => o.value === model.value)
  const next = (current === -1 ? 0 : current + offset + options.length) % options.length
  model.value = options[next]!.value
  buttons.value[next]?.focus()
}
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Voto"
    class="grid grid-cols-2"
    :class="isLarge ? 'gap-3' : 'gap-1.5'"
    @keydown.left.prevent="move(-1)"
    @keydown.up.prevent="move(-1)"
    @keydown.right.prevent="move(1)"
    @keydown.down.prevent="move(1)"
  >
    <button
      v-for="option in options"
      :key="option.value"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :tabindex="tabIndexFor(option.value)"
      :disabled="disabled"
      class="flex items-center justify-center gap-2 rounded-xl border-2 font-bold transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      :class="[
        isLarge ? 'h-14 text-base' : 'h-8 px-2 text-xs',
        model === option.value
          ? (option.value === BINARY_PASS
            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-600'
            : 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 dark:border-red-600')
          : 'border-border text-muted-foreground hover:bg-muted/50',
      ]"
      @click="select(option.value)"
    >
      <component :is="option.icon" :class="isLarge ? 'w-5 h-5' : 'w-3.5 h-3.5'" />
      {{ option.label }}
    </button>
  </div>
</template>
