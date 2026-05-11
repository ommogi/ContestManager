import { useAuthStore } from '~/stores/auth'

const PUBLIC_PATHS = ['/auth/login', '/auth/callback', '/join', '/c/']
const ONBOARDING_PATH = '/onboarding'

// Only org owners can access these
const ORG_ONLY_PATHS = ['/contests', '/judge-pool']

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const authStore = useAuthStore()

  const isPublic = to.path === '/' || PUBLIC_PATHS.some((p) => to.path.startsWith(p))
  const isOnboarding = to.path.startsWith(ONBOARDING_PATH)
  const isOrgOnly = ORG_ONLY_PATHS.some((p) => to.path.startsWith(p))

  // ── Not authenticated ──────────────────────────────────────────────────
  if (!authStore.isAuthenticated) {
    if (!isPublic) return navigateTo('/auth/login')
    return
  }

  // ── Authenticated ──────────────────────────────────────────────────────

  // Redirect away from auth pages (but allow /join for enrollments, /auth/callback to resolve returnTo,
  // and /auth/login?from=onboarding for users who need to switch accounts)
  const fromOnboarding = to.path === '/auth/login' && to.query.from === 'onboarding'
  if (isPublic
      && !to.path.startsWith('/join')
      && !to.path.startsWith('/c/')
      && !to.path.startsWith('/auth/callback')
      && !fromOnboarding) {
    return navigateTo('/dashboard')
  }

  // Onboarding checks — preserve returnTo when coming from /join
  const needsOb = authStore.needsOnboarding || authStore.needsOrgSetup
  if (needsOb && !isOnboarding && !fromOnboarding) {
    const rt = to.path.startsWith('/join') ? to.fullPath : ''
    return navigateTo(rt ? `${ONBOARDING_PATH}?returnTo=${encodeURIComponent(rt)}` : ONBOARDING_PATH)
  }

  // Block non-org users from org-only pages
  if (isOrgOnly && !authStore.isOrgOwner) return navigateTo('/my-contests')
})
