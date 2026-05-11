<script setup lang="ts">
import type { ComboboxGroupProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxGroup, useForwardProps } from "reka-ui"
import { cn } from '@/utils'

const props = defineProps<ComboboxGroupProps & { class?: string }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxGroup
    v-bind="forwardedProps"
    :class="cn('overflow-hidden p-1 text-foreground', props.class)"
  >
    <slot />
  </ComboboxGroup>
</template>
