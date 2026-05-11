<script setup lang="ts">
import type { ComboboxEmptyProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxEmpty, useForwardProps } from "reka-ui"
import { cn } from '@/utils'

const props = defineProps<ComboboxEmptyProps & { class?: string }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxEmpty
    v-bind="forwardedProps"
    :class="cn('py-6 text-center text-sm', props.class)"
  >
    <slot />
  </ComboboxEmpty>
</template>
