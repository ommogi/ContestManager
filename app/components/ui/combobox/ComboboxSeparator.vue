<script setup lang="ts">
import type { ComboboxSeparatorProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxSeparator, useForwardProps } from "reka-ui"
import { cn } from '@/utils'

const props = defineProps<ComboboxSeparatorProps & { class?: string }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxSeparator
    v-bind="forwardedProps"
    :class="cn('-mx-1 h-px bg-border', props.class)"
  >
    <slot />
  </ComboboxSeparator>
</template>
