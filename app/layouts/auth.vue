<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import Grainient from '@/components/ui/Grainient.vue'
</script>

<template>
  <div class="auth-shell relative min-h-screen overflow-hidden bg-black text-zinc-100 antialiased">
    <!-- Grainient WebGL backdrop -->
    <ClientOnly>
      <div class="pointer-events-none absolute inset-0">
        <Grainient
          color1="#1a1a2e"
          color2="#000000"
          color3="#9b9ec1"
          :time-speed="0.25"
          :color-balance="0"
          :warp-strength="1"
          :warp-frequency="5"
          :warp-speed="2"
          :warp-amplitude="50"
          :blend-angle="0"
          :blend-softness="0.05"
          :rotation-amount="500"
          :noise-scale="2"
          :grain-amount="0.1"
          :grain-scale="2"
          :grain-animated="false"
          :contrast="1.5"
          :gamma="1"
          :saturation="1"
          :center-x="0"
          :center-y="0"
          :zoom="0.9"
        />
      </div>
    </ClientOnly>

    <main class="relative min-h-screen flex items-center justify-center px-4 py-16">
      <div class="w-full max-w-md">
        <slot />
      </div>
    </main>

    <Toaster position="top-center" theme="dark" />
  </div>
</template>

<style>
.auth-shell {
  --background: 0 0% 9%;
  --foreground: 0 0% 98%;
  --muted: 0 0% 15%;
  --muted-foreground: 0 0% 65%;
  --popover: 0 0% 13%;
  --popover-foreground: 0 0% 98%;
  --card: 0 0% 13%;
  --card-foreground: 0 0% 98%;
  --border: 0 0% 18%;
  --input: 0 0% 18%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 13%;
  --secondary-foreground: 0 0% 98%;
  --accent: 0 0% 13%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --ring: 0 0% 65%;
  --sidebar-background: 0 0% 9%;
  --sidebar-foreground: 0 0% 98%;
  --sidebar-primary: 0 0% 98%;
  --sidebar-primary-foreground: 0 0% 9%;
  --sidebar-accent: 0 0% 13%;
  --sidebar-accent-foreground: 0 0% 98%;
  --sidebar-border: 0 0% 18%;
  --sidebar-ring: 0 0% 65%;
}
</style>
