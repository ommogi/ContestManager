<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Mail, ArrowLeft, Loader2 } from 'lucide-vue-next'

definePageMeta({
  layout: 'auth',
  middleware: []
})

const email = ref('')
const loading = ref(false)
const sent = ref(false)

async function handleReset() {
  if (!email.value.trim()) {
    toast.error('Introduce tu correo electrónico.')
    return
  }

  loading.value = true
  const { error } = await useSupabaseClient()
    .auth.resetPasswordForEmail(email.value.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?returnTo=/settings`,
    })
  loading.value = false

  if (error) {
    toast.error(error.message)
    return
  }

  sent.value = true
  toast.success('Correo de recuperación enviado. Revisa tu bandeja de entrada.')
}
</script>

<template>
  <div class="max-w-md mx-auto space-y-6">
    <!-- Back button -->
    <NuxtLink
      to="/auth/login"
      class="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
    >
      <ArrowLeft class="w-3.5 h-3.5" />
      Volver al login
    </NuxtLink>

    <!-- Heading -->
    <div class="flex flex-col items-center gap-3">
      <img
        src="https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/logo.png"
        alt="Logo"
        class="w-24 h-24 object-contain"
      />
      <h1 class="text-2xl font-bold tracking-tight text-zinc-100">
        Recuperar contraseña
      </h1>
      <p class="text-sm text-zinc-400 text-center max-w-xs">
        Introduce tu correo y te enviaremos un enlace para restablecer tu contraseña.
      </p>
    </div>

    <!-- Success state -->
    <div v-if="sent" class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-3 text-center">
      <Mail class="w-10 h-10 text-emerald-400 mx-auto" />
      <p class="text-sm text-zinc-100 font-medium">Correo enviado</p>
      <p class="text-xs text-zinc-400">
        Revisa tu bandeja de entrada (y spam) para el enlace de recuperación.
      </p>
      <NuxtLink
        to="/auth/login"
        class="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-lg bg-zinc-100 text-zinc-900 font-semibold text-sm hover:bg-white transition-colors"
      >
        Volver al login
      </NuxtLink>
    </div>

    <!-- Form -->
    <form v-else @submit.prevent="handleReset" class="space-y-4">
      <div class="space-y-1.5">
        <label for="email" class="text-sm text-zinc-300">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          placeholder="alan.turing@example.com"
          class="w-full h-11 px-3 rounded-lg bg-zinc-900/60 border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition"
        />
      </div>

      <button
        type="submit"
        :disabled="loading || !email"
        class="w-full h-11 rounded-lg bg-zinc-100 text-zinc-900 font-semibold text-sm hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
        {{ loading ? 'Enviando…' : 'Enviar enlace de recuperación' }}
      </button>
    </form>
  </div>
</template>
