<script setup lang="ts">
import type { ComboboxAnchorProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxAnchor, useForwardProps } from "reka-ui"
import { cn } from '@/utils'

const props = defineProps<ComboboxAnchorProps & { class?: string }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxAnchor
    v-bind="forwardedProps"
    :class="cn('w-full', props.class)"
  >
    <slot />
  </ComboboxAnchor>
</template>
