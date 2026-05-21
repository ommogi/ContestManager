---
title: API Playground
layout: page
---

<style>
.VPDoc { padding: 0 !important; }
.VPDoc .container { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
.auth-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1.25rem;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
}
.auth-bar strong { color: var(--vp-c-text-1); }
.auth-bar button {
  margin-left: auto;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 0.8125rem;
  cursor: pointer;
}
.auth-bar button:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
#scalar-root { height: calc(100vh - 64px - 37px); }
</style>

<div v-if="loggedIn" class="auth-bar">
  Conectado como <strong>{{ userEmail }}</strong>
  <button @click="logout">Cerrar sesión</button>
</div>
<div id="scalar-root"></div>

<script setup>
import { ref, onMounted } from 'vue'

const loggedIn = ref(false)
const userEmail = ref('')

function injectScalar(token) {
  const el = document.getElementById('scalar-root')
  if (!el) return
  el.innerHTML = ''
  const script = document.createElement('script')
  script.id = 'api-reference'
  script.setAttribute('data-url', '/openapi.yaml')
  script.setAttribute('data-configuration', JSON.stringify({
    theme: 'purple',
    defaultHttpClient: { targetKey: 'javascript', clientKey: 'fetch' },
    authentication: {
      preferredSecurityScheme: 'BearerAuth',
      http: { bearer: { token } },
    },
  }))
  script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference/dist/browser/standalone.min.js'
  el.appendChild(script)
}

async function logout() {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__)
    await sb.auth.signOut()
  } catch {}
  sessionStorage.removeItem('playground_token')
  sessionStorage.removeItem('playground_email')
  window.location.href = '/login'
}

onMounted(() => {
  const token = sessionStorage.getItem('playground_token')
  if (!token) {
    window.location.href = '/login'
    return
  }
  userEmail.value = sessionStorage.getItem('playground_email') || ''
  loggedIn.value = true
  injectScalar(token)
})
</script>
