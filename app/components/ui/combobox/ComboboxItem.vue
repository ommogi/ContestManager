<script setup lang="ts">
import type { ComboboxItemProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxItem, useForwardProps } from "reka-ui"
import { cn } from '@/utils'

const props = defineProps<ComboboxItemProps & { class?: string }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ComboboxItem
    v-bind="forwardedProps"
    :class="cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class,
    )"
  >
    <slot />
  </ComboboxItem>
</template>
