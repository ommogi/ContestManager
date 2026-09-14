import { defineEventHandler, getRequestHeader, createError } from 'h3'
import type { H3Event } from 'h3'
import { serverSupabaseAdmin } from '../utils/supabase'
import {
  MemoryRateLimitStore,
  PostgresRateLimitStore,
  resolveStoreMode,
  usesSharedStore,
  type RateLimitRpcClient,
  type RateLimitStore,
} from '../utils/rate-limit-store'

// Counters live in `server/utils/rate-limit-store.ts` since KAN-37. The limits
// below are unchanged: only where the counts are kept moved.

const WINDOW_MS = 60_000 // 1 minute
const PUBLIC_MAX = 30    // public endpoints (enrollment, checkout)
const AUTH_MAX = 20      // auth endpoints — raised from 10 to avoid blocking admins
const WEBHOOK_MAX = 60   // stripe webhook
const FINANCIAL_MAX = 10 // billing and refund endpoints

export function getLimit(path: string): number {
  if (path.startsWith('/api/stripe/webhook')) return WEBHOOK_MAX
  if (path.startsWith('/api/auth/')) return AUTH_MAX
  if (path.startsWith('/api/public/')) return PUBLIC_MAX
  // Read-only billing endpoints are polled by the app shell on every page load,
  // so they must not share the strict limit meant for money-moving calls —
  // otherwise normal navigation 429s and the ticket balance renders blank.
  if (path.startsWith('/api/billing/')) {
    const isReadOnly = path.startsWith('/api/billing/balance')
      || path.startsWith('/api/billing/plans')
      || path.startsWith('/api/billing/connect/status')
    if (!isReadOnly) return FINANCIAL_MAX
  }
  if (path.includes('/refund') || path.includes('/cancel')) return FINANCIAL_MAX
  return 120 // general API limit
}

/* -------------------------------------------------------------------------- */
/* Client IP resolution                                                        */
/* -------------------------------------------------------------------------- */

// `X-Forwarded-For` is written by the client and is only meaningful when a proxy we
// control appends to it. Deriving the rate-limit key from it without checking who sent
// the request lets an attacker rotate the header and get a fresh bucket per request —
// which both evades the limit and floods the bucket map.
//
// Configuration (environment variables, deployment-specific):
//   RATE_LIMIT_TRUSTED_PROXIES     comma-separated IPs or CIDRs of the reverse proxies /
//                                  CDN edge that sit in front of this app. Empty or unset
//                                  (the default) means "no proxy is trusted": the header is
//                                  ignored entirely and the socket peer address is used.
//   RATE_LIMIT_TRUSTED_PROXY_HOPS  how many trusted hops to walk back through, counting
//                                  from the right of the chain. Defaults to 1.
//
// Both values must match the actual deployment topology. Declaring more hops than the
// deployment really has would let a client inject an extra entry and reclaim the evasion,
// so the walk additionally refuses to step over any address that is not in the trusted list.

const MAX_TRUSTED_PROXY_HOPS = 8 // sanity ceiling for the configured hop count
const MAX_XFF_ENTRIES = 16       // cap parsing work on an attacker-supplied header
const MAX_IP_LENGTH = 45         // longest possible textual IPv6 address
const DEFAULT_HOPS = 1

interface TrustedRange {
  bytes: Uint8Array
  prefix: number
}

export interface TrustedProxyConfig {
  ranges: TrustedRange[]
  hops: number
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV6_GROUP_RE = /^[0-9a-fA-F]{1,4}$/

function parseIpv4(value: string): Uint8Array | null {
  const match = IPV4_RE.exec(value)
  if (!match) return null
  const bytes = new Uint8Array(4)
  for (let i = 0; i < 4; i++) {
    const part = match[i + 1] as string
    // Reject leading zeros: "010" is ambiguous (octal in some parsers) and would let the
    // same address produce several distinct textual forms, i.e. several buckets.
    if (part.length > 1 && part.startsWith('0')) return null
    const octet = Number(part)
    if (octet > 255) return null
    bytes[i] = octet
  }
  return bytes
}

function parseIpv6(value: string): Uint8Array | null {
  const addr = value.split('%')[0] as string // drop any zone identifier
  if (!addr.includes(':')) return null

  const halves = addr.split('::')
  if (halves.length > 2) return null

  const toGroups = (part: string): number[] | null => {
    if (part === '') return []
    const tokens = part.split(':')
    const groups: number[] = []
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i] as string
      // A trailing dotted-quad encodes the last two groups (e.g. ::ffff:192.0.2.1)
      if (i === tokens.length - 1 && token.includes('.')) {
        const embedded = parseIpv4(token)
        if (!embedded) return null
        groups.push(((embedded[0] as number) << 8) | (embedded[1] as number))
        groups.push(((embedded[2] as number) << 8) | (embedded[3] as number))
        continue
      }
      if (!IPV6_GROUP_RE.test(token)) return null
      groups.push(parseInt(token, 16))
    }
    return groups
  }

  const head = toGroups(halves[0] as string)
  const tail = halves.length === 2 ? toGroups(halves[1] as string) : []
  if (!head || !tail) return null

  let groups: number[]
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length
    if (fill < 1) return null // "::" must stand for at least one zero group
    groups = [...head, ...new Array<number>(fill).fill(0), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  const bytes = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    const group = groups[i] as number
    bytes[i * 2] = group >> 8
    bytes[i * 2 + 1] = group & 0xff
  }
  return bytes
}

function isIpv4Mapped(bytes: Uint8Array): boolean {
  if (bytes.length !== 16) return false
  for (let i = 0; i < 10; i++) {
    if (bytes[i] !== 0) return false
  }
  return bytes[10] === 0xff && bytes[11] === 0xff
}

/** Strip surrounding brackets and any trailing port some proxies append to a chain entry. */
function stripPortAndBrackets(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end === -1 ? value.slice(1) : value.slice(1, end)
  }
  // A single colon on a dotted value is "1.2.3.4:5678", not an IPv6 address.
  const firstColon = value.indexOf(':')
  if (firstColon !== -1 && firstColon === value.lastIndexOf(':') && value.includes('.')) {
    return value.slice(0, firstColon)
  }
  return value
}

/** Raw address bytes: 4 for IPv4 (and IPv4-mapped IPv6), 16 for IPv6. Null when invalid. */
function ipToBytes(value: string): Uint8Array | null {
  if (!value || value.length > MAX_IP_LENGTH) return null
  const v4 = parseIpv4(value)
  if (v4) return v4
  const v6 = parseIpv6(value)
  if (!v6) return null
  // Collapse ::ffff:a.b.c.d so one client cannot occupy two buckets with two spellings.
  return isIpv4Mapped(v6) ? v6.slice(12) : v6
}

function formatIp(bytes: Uint8Array): string {
  if (bytes.length === 4) return Array.from(bytes).join('.')
  const groups: string[] = []
  for (let i = 0; i < 16; i += 2) {
    groups.push((((bytes[i] as number) << 8) | (bytes[i + 1] as number)).toString(16))
  }
  // Fully expanded lowercase form — deterministic, which is all a bucket key needs.
  return groups.join(':')
}

/**
 * Validate and canonicalise an address. Returns null for anything that is not a real IP,
 * which keeps attacker-supplied junk (`unknown`, `_hidden`, arbitrarily long strings) out
 * of the bucket keys.
 */
export function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null
  const bytes = ipToBytes(stripPortAndBrackets(raw))
  return bytes ? formatIp(bytes) : null
}

function parseCidr(entry: string): TrustedRange | null {
  const trimmed = entry.trim()
  if (!trimmed) return null
  const slash = trimmed.indexOf('/')
  const addr = slash === -1 ? trimmed : trimmed.slice(0, slash)
  const bytes = ipToBytes(stripPortAndBrackets(addr))
  if (!bytes) return null
  const maxPrefix = bytes.length * 8
  if (slash === -1) return { bytes, prefix: maxPrefix }
  const prefix = Number(trimmed.slice(slash + 1))
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null
  return { bytes, prefix }
}

export function parseTrustedProxyConfig(
  rawList: string | undefined,
  rawHops: string | undefined,
): TrustedProxyConfig {
  const ranges = (rawList ?? '')
    .split(',')
    .map(parseCidr)
    .filter((range): range is TrustedRange => range !== null)

  const parsedHops = Number((rawHops ?? '').trim())
  const hops = Number.isInteger(parsedHops) && parsedHops > 0
    ? Math.min(parsedHops, MAX_TRUSTED_PROXY_HOPS)
    : DEFAULT_HOPS

  return { ranges, hops }
}

function isTrusted(ip: string, ranges: TrustedRange[]): boolean {
  const bytes = ipToBytes(ip)
  if (!bytes) return false
  for (const range of ranges) {
    if (bytes.length !== range.bytes.length) continue
    let bitsLeft = range.prefix
    let matches = true
    for (let i = 0; i < bytes.length && bitsLeft > 0; i++) {
      const take = Math.min(8, bitsLeft)
      const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff
      if (((bytes[i] as number) & mask) !== ((range.bytes[i] as number) & mask)) {
        matches = false
        break
      }
      bitsLeft -= take
    }
    if (matches) return true
  }
  return false
}

/**
 * Derive the client IP from the socket peer address, walking back through
 * `X-Forwarded-For` only across hops that are declared trusted proxies.
 *
 * - No trusted proxies configured -> the header is ignored, socket address wins.
 * - Request not coming from a trusted proxy -> the header is ignored, socket address wins.
 *   A forged header therefore lands in the attacker's own bucket.
 * - Request from a trusted proxy -> step left one entry per declared hop, stopping early
 *   at the first hop that is not itself trusted, or at the first malformed entry.
 */
export function resolveClientIp(
  socketIp: string | undefined | null,
  forwardedFor: string | undefined | null,
  config: TrustedProxyConfig,
): string {
  const peer = normalizeIp(socketIp)
  // Fail closed: an unusable peer address shares one bucket rather than getting a free pass.
  if (!peer) return 'unknown'
  if (config.ranges.length === 0) return peer

  // Chain left-to-right: leftmost is what the client claimed, rightmost is the hop nearest us.
  const chain = forwardedFor
    ? forwardedFor.split(',').slice(-MAX_XFF_ENTRIES).map(entry => normalizeIp(entry))
    : []

  let candidate = peer
  let index = chain.length - 1
  for (let step = 0; step < config.hops; step++) {
    if (!isTrusted(candidate, config.ranges)) break // the hop we can see is not ours
    if (index < 0) break                            // chain exhausted
    const next = chain[index--]
    if (!next) break                                // malformed entry: keep the last good hop
    candidate = next
  }
  return candidate
}

// Parsing is cached, but keyed on the raw env values so a change (or a test overriding them)
// is picked up without a restart.
let cachedConfigKey: string | null = null
let cachedConfig: TrustedProxyConfig = { ranges: [], hops: DEFAULT_HOPS }

export function getTrustedProxyConfig(): TrustedProxyConfig {
  const rawList = process.env.RATE_LIMIT_TRUSTED_PROXIES ?? ''
  const rawHops = process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS ?? ''
  const key = `${rawList}|${rawHops}`
  if (key !== cachedConfigKey) {
    cachedConfig = parseTrustedProxyConfig(rawList, rawHops)
    cachedConfigKey = key
  }
  return cachedConfig
}

/**
 * Client IP on Vercel.
 *
 * Vercel overwrites X-Forwarded-For at the edge and does not forward external
 * IPs, explicitly to prevent spoofing, so the header is authoritative and holds
 * the client's public IP. (Overriding it needs the Enterprise "Trusted Proxy"
 * add-on.) The socket peer here is Vercel's internal infrastructure, which has
 * no stable address to put in RATE_LIMIT_TRUSTED_PROXIES — so the generic
 * trusted-proxy path would ignore the header and collapse every visitor into a
 * single bucket.
 *
 * x-vercel-forwarded-for is preferred: it is identical to x-forwarded-for but
 * survives a customer proxy layered on top of Vercel, which may rewrite the
 * latter.
 *
 * Returns null when not running on Vercel, or when the headers are unusable.
 */
export function getVercelClientIp(event: H3Event): string | null {
  if (!process.env.VERCEL) return null

  const header =
    getRequestHeader(event, 'x-vercel-forwarded-for') ??
    getRequestHeader(event, 'x-forwarded-for')
  if (!header) return null

  // Vercel sets a single public IP; take the first entry defensively.
  const first = header.split(',')[0]
  return normalizeIp(first)
}

function getClientIp(event: H3Event): string {
  const vercelIp = getVercelClientIp(event)
  if (vercelIp) return vercelIp

  // Deliberately not h3's getRequestIP({ xForwardedFor: true }): it returns the first
  // X-Forwarded-For entry, which is entirely client-controlled.
  const socketIp = event.node?.req?.socket?.remoteAddress
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for')
  return resolveClientIp(socketIp, forwardedFor, getTrustedProxyConfig())
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Stores                                                                      */
/* -------------------------------------------------------------------------- */

// Built once per process. The memory store always exists: it backs the general
// bucket and is where the shared store falls back when the database is down.
const memoryStore = new MemoryRateLimitStore()
let sharedStore: RateLimitStore | null = null

function getSharedStore(): RateLimitStore {
  if (sharedStore) return sharedStore
  sharedStore = resolveStoreMode() === 'postgres'
    ? new PostgresRateLimitStore(() => serverSupabaseAdmin() as unknown as RateLimitRpcClient)
    : memoryStore
  return sharedStore
}

/** Test seam: forces the stores to be rebuilt from the current environment. */
export function __resetRateLimitStores(): void {
  sharedStore = null
}

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  const ip = getClientIp(event)
  // Prefer user ID for authenticated requests — prevents IP-sharing false positives
  // and gives per-user limits on financial endpoints. Falls back to IP for public routes.
  const userId = (event.context.user as { id?: string } | undefined)?.id
  const clientKey = userId ? `user:${userId}` : `ip:${ip}`
  const key = `${clientKey}:${event.path}`
  const limit = getLimit(event.path)

  // Only the abuse-facing buckets pay for a shared counter; see usesSharedStore().
  const store = usesSharedStore(event.path) ? getSharedStore() : memoryStore

  const { count } = await store.hit(key, WINDOW_MS, Date.now())
  if (count > limit) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
  }
})
