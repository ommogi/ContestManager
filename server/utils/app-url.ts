// server/utils/app-url.ts
//
// The base URL every outbound link is built on.
//
// Five call sites repeated `process.env.APP_BASE_URL || 'https://contestsaas.app'`
// — the four invitation and resend endpoints, plus the dashboard link in the
// welcome email. Every invitation link the product sends is built from this, so
// an unset variable does not degrade anything: it mails people a link to a
// domain that may not be the app at all, and nobody finds out until someone
// clicks.
//
// Same shape as `warnIfSenderUnconfigured()` in ./email.ts, and for the same
// reason KAN-63 taught: a configuration gap should be loud the moment it starts
// mattering, not quietly absorbed by a default.

/**
 * Last-resort base URL.
 *
 * Deliberately still the old domain rather than "updated" to a newer one. The
 * brand rename that introduced this file changes no domain anywhere: which host
 * is actually registered and serving the app is a fact about the deployment,
 * not about the code, and guessing it here would turn every invitation link
 * into a confident mistake. Production sets APP_BASE_URL, so this value only
 * decides how a misconfigured environment fails.
 */
export const DEFAULT_APP_BASE_URL = 'https://contestsaas.app'

let warned = false

/**
 * Resolves the app's base URL, trailing slash stripped so callers can always
 * concatenate `/path` without producing a double slash — which the five
 * previous copies each had to remember not to do.
 */
export function appBaseUrl(): string {
  const configured = (process.env.APP_BASE_URL ?? '').trim()

  if (!configured) {
    if (!warned) {
      warned = true
      console.warn(
        `[app-url] APP_BASE_URL is not set; falling back to ${DEFAULT_APP_BASE_URL}. `
        + 'Every invitation and enrolment link is built from this, so they will '
        + 'point at that domain until it is configured.',
      )
    }
    return DEFAULT_APP_BASE_URL
  }

  return configured.replace(/\/+$/, '')
}

/** Test seam: lets a suite exercise the warning more than once. */
export function __resetAppUrlWarning(): void {
  warned = false
}
