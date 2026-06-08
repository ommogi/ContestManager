---
title: Iniciar sesión — API Playground
layout: page
---

<style>
.login-wrap {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 2rem;
}
.login-card h2 {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
  font-weight: 600;
}
.login-card p.sub {
  margin: 0 0 1.5rem;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}
.field { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1rem; }
.field label { font-size: 0.8125rem; font-weight: 500; color: var(--vp-c-text-2); }
.field input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.9375rem;
  outline: none;
  transition: border-color 0.15s;
}
.field input:focus { border-color: var(--vp-c-brand-1); }
.btn-login {
  width: 100%;
  padding: 0.625rem;
  background: var(--vp-c-brand-1);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  margin-top: 0.5rem;
  transition: opacity 0.15s;
}
.btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
.error-msg {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 6px;
  font-size: 0.8125rem;
}
</style>

<div class="login-wrap">
  <div class="login-card">
    <h2>API Playground</h2>
    <p class="sub">Inicia sesión con tu cuenta de ContestSaaS</p>
    <div class="field">
      <label>Email</label>
      <input v-model="email" type="email" placeholder="tu@email.com" @keyup.enter="login" :disabled="loading" />
    </div>
    <div class="field">
      <label>Contraseña</label>
      <input v-model="password" type="password" placeholder="••••••••" @keyup.enter="login" :disabled="loading" />
    </div>
    <button class="btn-login" @click="login" :disabled="loading">
      {{ loading ? 'Conectando…' : 'Iniciar sesión' }}
    </button>
    <div v-if="error" class="error-msg">{{ error }}</div>
  </div>
</div>

<script setup>
import { ref, onMounted } from 'vue'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

onMounted(() => {
  // Already logged in → go straight to playground
  if (sessionStorage.getItem('playground_token')) {
    window.location.href = '/playground'
  }
})

async function login() {
  if (!email.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__)
    const { data, error: e } = await sb.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (e) { error.value = e.message; return }
    sessionStorage.setItem('playground_token', data.session.access_token)
    sessionStorage.setItem('playground_email', data.user.email ?? '')
    window.location.href = '/playground'
  } catch (err) {
    error.value = (err && err.message) ? err.message : 'Error desconocido'
  } finally {
    loading.value = false
  }
}
</script>
