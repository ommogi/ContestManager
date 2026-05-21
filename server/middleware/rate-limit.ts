import { defineEventHandler, getRequestIP, createError } from 'h3'

// Simple in-memory rate limiter.
// For production with multiple workers, replace with Redis or a shared store.

interface RateEntry {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateEntry>()

const WINDOW_MS = 60_000 // 1 minute
const PUBLIC_MAX = 30    // public endpoints (enrollment, checkout)
const AUTH_MAX = 20      // auth endpoints — raised from 10 to avoid blocking admins
const WEBHOOK_MAX = 60   // stripe webhook
const FINANCIAL_MAX = 10 // billing and refund endpoints
const MAX_BUCKETS = 2000 // hard cap to prevent memory exhaustion under distributed attack

export function getLimit(path: string): number {
  if (path.startsWith('/api/stripe/webhook')) return WEBHOOK_MAX
  if (path.startsWith('/api/auth/')) return AUTH_MAX
  if (path.startsWith('/api/public/')) return PUBLIC_MAX
  if (path.startsWith('/api/billing/')) return FINANCIAL_MAX
  if (path.includes('/refund') || path.includes('/cancel')) return FINANCIAL_MAX
  return 120 // general API limit
}

function cleanup(now: number) {
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt < now) buckets.delete(key)
  }
}

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  // Prefer user ID for authenticated requests — prevents IP-sharing false positives
  // and gives per-user limits on financial endpoints. Falls back to IP for public routes.
  const userId = (event.context.user as any)?.id
  const clientKey = userId ? `user:${userId}` : `ip:${ip}`
  const key = `${clientKey}:${event.path}`
  const now = Date.now()
  const limit = getLimit(event.path)

  // Periodic cleanup every ~1000 entries
  if (buckets.size > 1000) cleanup(now)

  // Hard cap: reject new IPs when bucket map is full (prevents memory exhaustion)
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }

  let entry = buckets.get(key)
  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + WINDOW_MS }
    buckets.set(key, entry)
    return
  }

  entry.count++
  if (entry.count > limit) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
})
