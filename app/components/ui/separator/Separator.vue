<script setup lang="ts">
import type { SeparatorProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { Separator, useForwardProps } from "reka-ui"
import { cn } from '@/utils'

const props = defineProps<SeparatorProps & { class?: string }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <Separator
    v-bind="forwardedProps"
    :class="cn(
      'shrink-0 bg-border',
      props.orientation === 'vertical' ? 'w-px h-full' : 'h-px w-full',
      props.class,
    )"
  />
</template>
