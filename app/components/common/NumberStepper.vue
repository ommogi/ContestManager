<script setup lang="ts">
// A number input with − / + buttons on either side, instead of the browser's
// spinner. Built on reka-ui's NumberField: press and hold repeats, the arrow
// keys and Page Up/Down step, and clearing the field leaves it empty.
import { NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput, NumberFieldRoot } from 'reka-ui'
import { Minus, Plus } from 'lucide-vue-next'

const model = defineModel<number | undefined>()

withDefaults(defineProps<{
  id?: string
  min?: number
  max?: number
  step?: number
  placeholder?: string
  invalid?: boolean
  /** Name read out on the − / + buttons, e.g. "edad mínima". */
  label?: string
}>(), { step: 1 })
</script>

<template>
  <NumberFieldRoot
    v-model="model"
    :min="min"
    :max="max"
    :step="step"
    :format-options="{ useGrouping: false }"
    locale="es-ES"
    class="flex h-10 w-full items-stretch overflow-hidden rounded-md border bg-background text-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background"
    :class="invalid ? 'border-red-500' : 'border-input'"
  >
    <NumberFieldDecrement
      class="flex w-9 shrink-0 items-center justify-center border-r border-input text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
      :aria-label="label ? `Restar ${label}` : 'Restar'"
    >
      <Minus class="h-3.5 w-3.5" />
    </NumberFieldDecrement>
    <NumberFieldInput
      :id="id"
      :placeholder="placeholder"
      :aria-invalid="invalid || undefined"
      class="min-w-0 flex-1 bg-transparent px-1 text-center tabular-nums outline-none placeholder:text-muted-foreground"
    />
    <NumberFieldIncrement
      class="flex w-9 shrink-0 items-center justify-center border-l border-input text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
      :aria-label="label ? `Sumar ${label}` : 'Sumar'"
    >
      <Plus class="h-3.5 w-3.5" />
    </NumberFieldIncrement>
  </NumberFieldRoot>
</template>
