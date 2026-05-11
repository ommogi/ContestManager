<script setup lang="ts">
import type { ComboboxInputProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxInput, useForwardProps } from "reka-ui"
import { cn } from '@/utils'

const props = defineProps<ComboboxInputProps & { class?: string }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxInput
    v-bind="forwardedProps"
    :class="cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      props.class,
    )"
  />
</template>
