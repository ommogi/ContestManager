// server/api/health.get.ts
//
// Real dependency check (KAN-54). This used to `return { status: 'ok' }`
// unconditionally while importing the two clients it never called.
//
// Thin on purpose: the probes live in `server/utils/health.ts` where they can
// be unit-tested. Here we only bind the real clients and map the outcome to a
// status code.
//
// Contract, for whoever wires up monitoring:
//   200 { status: 'ok',       dependencies: { supabase: {...}, stripe: {...} } }
//   503 { status: 'degraded', … }  ← at least one dependency is down
//
// Each dependency reports `status`, `durationMs` and, when down, a fixed
// `reason` of `timeout`, `not_configured` or `unavailable`. Never a database
// message, a connection string or part of a key: the endpoint takes no session
// (KAN-43).
//
// Rate limiting: /api/health falls under the general 120/min bucket in
// `server/middleware/rate-limit.ts`. A monitor polling every 10 s uses 6 of
// those, so the default is comfortable — but a per-second check from several
// probes sharing an egress IP would not be, and that is worth knowing before
// configuring one.

import { defineEventHandler, setResponseStatus } from 'h3'
import { serverSupabaseAdmin } from '../utils/supabase'
import { getStripe } from '../utils/stripe'
import {
  checkStripe,
  checkSupabase,
  summarize,
  type HealthStripeClient,
  type HealthSupabaseClient,
} from '../utils/health'

export default defineEventHandler(async (event) => {
  // The client factories are passed rather than the clients themselves:
  // `serverSupabaseAdmin()` and `getStripe()` throw when their key is missing,
  // and that has to be caught *inside* the probe and reported as
  // `not_configured` instead of turning the health check itself into a 500.
  const [supabase, stripe] = await Promise.all([
    checkSupabase(() => serverSupabaseAdmin() as unknown as HealthSupabaseClient),
    checkStripe(() => getStripe() as unknown as HealthStripeClient),
  ])

  const { report, statusCode } = summarize({ supabase, stripe })
  setResponseStatus(event, statusCode)
  return report
})
