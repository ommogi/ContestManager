<script setup lang="ts">
import type { ComboboxViewportProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxViewport, useForwardProps } from "reka-ui"
import { cn } from '@/utils'

const props = defineProps<ComboboxViewportProps & { class?: string }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxViewport
    v-bind="forwardedProps"
    :class="cn(
      'p-1 h-[var(--reka-combobox-trigger-height)] w-full min-w-[var(--reka-combobox-trigger-width)]',
      props.class,
    )"
  >
    <slot />
  </ComboboxViewport>
</template>
