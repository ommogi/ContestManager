// Sentry Nitro init (loaded by @sentry/nuxt when SENTRY_DSN set).
import * as Sentry from '@sentry/nuxt'

const dsn = process.env.SENTRY_DSN || ''

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
    release: process.env.APP_VERSION || undefined,
    tracesSampleRate: 0.1,
    // Drop PII: webhook raw bodies etc.
    beforeSend(event) {
      if (event.request?.data) {
        try {
          const s = typeof event.request.data === 'string'
            ? event.request.data
            : JSON.stringify(event.request.data)
          if (s.length > 4000) event.request.data = '[redacted:large]'
        } catch { /* redaction failed, keep original */ }
      }
      return event
    },
  })
}
