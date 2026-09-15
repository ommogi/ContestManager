<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { computed, useAttrs } from "vue"
import { useVModel } from "@vueuse/core"
import { cn } from '@/utils'

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const attrs = useAttrs()

// A file input cannot be bound with v-model. The directive writes `el.value` on
// every patch, and the spec only allows setting a file input's value to the
// empty string — anything else throws InvalidStateError, killing the render
// right after the user picks a file. It is inherently uncontrolled: callers
// read `files` off the change event (see DynamicFormRenderer, ImportCsvDialog).
const isFile = computed(() => attrs.type === 'file')

const classes = computed(() => cn(
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-foreground file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  props.class,
))

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
</script>

<template>
  <input v-if="isFile" :class="classes">
  <input v-else v-model="modelValue" :class="classes">
</template>
