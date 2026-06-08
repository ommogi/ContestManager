// Nitro global error handler. Logs structured context for every unhandled
// API error. Also captures to Sentry when @sentry/nuxt is active.
import type { NitroApp } from 'nitropack'

export default (nitroApp: NitroApp) => {
  nitroApp.hooks.hook('error', async (err: any, { event }) => {
    const url = event?.path || event?.node?.req?.url || ''
    const method = event?.node?.req?.method || ''
    const status = err?.statusCode || 500
    // Skip noisy 401/404 for API
    if (status === 401 || status === 404) return

    const line = `[nitro-error] ${method} ${url} → ${status} :: ${err?.statusMessage || err?.message || 'unknown'}`
    // eslint-disable-next-line no-console
    console.error(line, err?.data || '')

    // Sentry capture (lazy import — avoids load when module absent)
    if (process.env.SENTRY_DSN) {
      try {
        const Sentry = await import('@sentry/nuxt')
        Sentry.captureException(err, {
          tags: { status: String(status), method },
          extra: { url, data: err?.data },
        })
      } catch { console.error('[error-handler] sentry capture failed') }
    }
  })
}
