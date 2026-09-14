// https://nuxt.com/docs/api/configuration/nuxt-config

const sentryModule = process.env.SENTRY_DSN ? '@sentry/nuxt/module' : null

/* -------------------------------------------------------------------------- */
/* Security headers (KAN-39)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Origin of a URL, or null when the value is missing or unparseable.
 *
 * The hosts below are read from the environment at build time rather than
 * hardcoded: a CSP naming a Supabase project the app no longer talks to is
 * worse than no CSP, because it looks enforced and is not.
 */
function originOf(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

const supabaseOrigin = originOf(process.env.SUPABASE_URL)
const sentryOrigin = originOf(process.env.SENTRY_DSN)

/**
 * Content-Security-Policy, served in **Report-Only** mode.
 *
 * Why not enforced: Nuxt's renderer emits an inline bootstrap script —
 * `window.__NUXT__={};window.__NUXT__.config=…` — and offers no nonce hook, so
 * `script-src 'self'` would stop the app from booting. Enforcing would mean
 * `'unsafe-inline'` on `script-src`, which disables exactly the protection a
 * CSP is for. Report-Only keeps the policy honest and strict while the reports
 * tell us what a real session actually needs.
 *
 * Expect the inline bootstrap to appear in every report: that violation is
 * known and is the reason this is Report-Only. What matters is everything else
 * that shows up.
 *
 * Origins, verified against the code rather than assumed:
 *   * Supabase — https for REST and Storage, **wss** for Realtime, which is
 *     used by useNotifications, useRoundScoresRealtime and the auth store.
 *     Images come from the same host, including a hardcoded cover in
 *     ContestCard.vue.
 *   * Sentry — the DSN host only, and only when SENTRY_DSN is set; the module
 *     itself is loaded conditionally on the same variable.
 *   * Stripe — **nothing**. There is no Stripe.js in the client (`stripe` is
 *     the server SDK) and checkout is reached with `window.location.href`,
 *     a top-level navigation that CSP does not restrict.
 *
 * `style-src` has to allow inline: Vue injects component styles at runtime. A
 * permissive style-src is a far smaller exposure than a permissive script-src,
 * and it is the price of not adding a dependency.
 */
const cspReportOnly = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `frame-src 'none'`,
  `object-src 'none'`,
  `script-src 'self'`,
  `style-src 'self' 'unsafe-inline'`,
  `font-src 'self'`,
  // blob: covers jsPDF's generated documents and canvas-derived images.
  `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, 'wss:')}` : ''}${sentryOrigin ? ` ${sentryOrigin}` : ''}`,
  // Without a destination the reports only reach each visitor's console, where
  // nobody can review them. /api/csp-report just records them.
  `report-uri /api/csp-report`,
].join('; ')

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // No `preload`: that requires every subdomain to serve HTTPS and is a list
  // that is slow and painful to leave. Decide it separately, on purpose.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // None of these are used. Payment happens on Stripe's own domain, so even the
  // Payment Request API has no business being reachable from here.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy-Report-Only': cspReportOnly,
}

const modules = [
  '@pinia/nuxt',
  '@nuxtjs/tailwindcss',
  'shadcn-nuxt',
  '@nuxtjs/color-mode',
  'nuxt-charts',
  ...(sentryModule ? [sentryModule] : []),
] as any[]



export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: false },
  modules,
  sentry: {
    sourceMapsUploadOptions: {
      org: process.env.SENTRY_ORG || '',
      project: process.env.SENTRY_PROJECT || '',
      authToken: process.env.SENTRY_AUTH_TOKEN || '',
    },
  },
  css: ['vue-sonner/style.css', '~/assets/css/charts.css', '~/assets/css/editor.css'],
  colorMode: {
    classSuffix: ''
  },
  shadcn: {
    prefix: '',
    componentDir: './app/components/ui'
  },
  runtimeConfig: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    platformFeeBps: process.env.PLATFORM_FEE_BPS || '500', // 500 bps = 5%
    appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    public: {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      sentryDsn: process.env.SENTRY_DSN || '',
      sentryEnv: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      appVersion: process.env.APP_VERSION || '',
    }
  },
  vite: {
    // Pre-bundle these so Vite doesn't discover them at runtime and reload the page.
    optimizeDeps: {
      include: [
        '@supabase/supabase-js',
        'lucide-vue-next',
        'class-variance-authority',
        'ogl',
        'reka-ui',
        'clsx',
        'tailwind-merge',
        '@vueuse/core',
        'vue-sonner',
        '@tanstack/vue-table',
        'jspdf',
        '@internationalized/date',
      ],
    },
  },
  nitro: {
    routeRules: {
      '/api/stripe/webhook': { cors: false },
      '/**': { headers: securityHeaders }
    }
  }
})