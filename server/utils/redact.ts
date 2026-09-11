/**
 * Shared PII / secret redaction for anything that leaves the server towards an
 * external processor (Sentry) or the hosting provider's logs.
 *
 * The rule is by *field name*, not by payload size: an enrollment body carrying
 * a DNI, an email, a phone number and a birthdate weighs a few hundred bytes,
 * which is exactly the case a size-only filter lets through. The size cap is
 * kept as an extra net for opaque blobs (raw webhook bodies, etc.).
 *
 * Key matching is case- and separator-insensitive: `dni`, `DNI`, `full_name`,
 * `fullName` and `FULL-NAME` all resolve to the same normalized key.
 */

export const REDACTED = '[redacted]'
export const REDACTED_LARGE = '[redacted:large]'
export const REDACTED_DEPTH = '[redacted:depth]'
export const REDACTED_CIRCULAR = '[redacted:circular]'

/** Serialized-size cap inherited from the previous size-only rule. */
export const MAX_SERIALIZED_CHARS = 4000
/** Guard against pathological / self-referencing structures. */
const MAX_DEPTH = 8
/** Zod messages are diagnostics, not payloads — keep them short. */
const MAX_ISSUE_MESSAGE_CHARS = 200

/** Lowercase and drop every separator so casing/underscores/dashes don't matter. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Exact (normalized) field names that must never leave the server.
 * Derived from what the project actually stores — see `server/utils/schemas.ts`
 * (`EnrollBodySchema`, `CheckoutEnrollmentSchema`, `ParticipantPatchSchema`,
 * `JudgePoolSchema`) plus the auth / Stripe surfaces.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  // Identity documents (DNI / NIE / passport)
  'dni', 'nie', 'nif', 'passport', 'pasaporte', 'documentid', 'documentnumber',
  'docnumber', 'idnumber', 'taxid',
  // Contact details
  'email', 'emails', 'emailaddress', 'correo', 'phone', 'phonenumber',
  'telefono', 'mobile', 'whatsapp',
  // Names of natural persons (contest/round/category `name` stays visible)
  'firstname', 'lastname', 'fullname', 'surname', 'nombre', 'apellido',
  'apellidos', 'guardianname', 'contactname',
  // Birth data — minors are involved
  'birthdate', 'birthday', 'dateofbirth', 'dob', 'fechanacimiento',
  // Location / postal address
  'address', 'address1', 'address2', 'addressline1', 'addressline2', 'street',
  'postalcode', 'postcode', 'zip', 'zipcode', 'country',
  // Credentials & session material
  'password', 'passwordhash', 'secret', 'authorization', 'auth', 'cookie',
  'setcookie', 'session', 'sessionid', 'jwt', 'bearer', 'credentials',
  'privatekey', 'signature', 'otp', 'pin',
  // Stripe identifiers
  'customerid', 'stripecustomerid', 'stripeaccountid', 'stripesessionid',
  'checkoutsessionid', 'paymentintent', 'paymentintentid', 'setupintent',
  'setupintentid', 'paymentmethod', 'paymentmethodid', 'chargeid',
  'clientsecret',
])

/**
 * Normalized fragments: any key *containing* one of these is redacted.
 * Covers the open-ended families (`invite_token`, `inscription_token`,
 * `access_token`, ...) without enumerating them.
 */
const SENSITIVE_FRAGMENTS: readonly string[] = [
  'password', 'secret', 'token', 'apikey', 'authorization', 'creditcard',
  'cardnumber', 'cvv', 'iban', 'ssn',
]

/** True when a field name matches the deny list. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  if (!normalized) return false
  if (SENSITIVE_KEYS.has(normalized)) return true
  return SENSITIVE_FRAGMENTS.some(fragment => normalized.includes(fragment))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function walk(value: unknown, depth: number, path: Set<object>): unknown {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (depth >= MAX_DEPTH) return REDACTED_DEPTH
  // Path-scoped cycle detection: siblings pointing at the same object are fine.
  if (path.has(value)) return REDACTED_CIRCULAR

  path.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map(item => walk(item, depth + 1, path))
    }
    if (value instanceof Map) {
      const fromMap: Record<string, unknown> = {}
      for (const [key, item] of value.entries()) {
        const name = String(key)
        fromMap[name] = isSensitiveKey(name) ? REDACTED : walk(item, depth + 1, path)
      }
      return fromMap
    }
    if (value instanceof Set) {
      return [...value].map(item => walk(item, depth + 1, path))
    }
    if (value instanceof Error) {
      return { name: value.name, message: value.message }
    }

    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1, path)
    }
    return out
  } catch {
    // Exotic getters/proxies: fail closed rather than forward the raw value.
    return REDACTED
  } finally {
    path.delete(value)
  }
}

/**
 * Recursively replace the value of every sensitive key with `[redacted]`,
 * keeping the key itself so the shape of the payload stays diagnosable.
 * Returns a copy; the input is never mutated.
 */
export function redactSensitive(value: unknown): unknown {
  return walk(value, 0, new Set<object>())
}

/** Replace the whole value when its serialized form exceeds `maxChars`. */
export function capBySize(value: unknown, maxChars: number = MAX_SERIALIZED_CHARS): unknown {
  if (value === null || value === undefined) return value
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    if (typeof serialized === 'string' && serialized.length > maxChars) return REDACTED_LARGE
  } catch {
    // Not serializable (cycles the walker already handled, BigInt, ...).
    return REDACTED_LARGE
  }
  return value
}

/**
 * Request bodies reach Sentry either parsed or as a raw JSON string (webhooks).
 * Parse the string form so the deny list can still apply, then keep the size cap.
 */
export function redactRequestData(data: unknown, maxChars: number = MAX_SERIALIZED_CHARS): unknown {
  if (data === null || data === undefined) return data

  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const redacted = redactSensitive(JSON.parse(trimmed))
        return capBySize(JSON.stringify(redacted), maxChars)
      } catch {
        // Not JSON after all — an opaque body only the size cap can protect.
        return capBySize(data, maxChars)
      }
    }
    return capBySize(data, maxChars)
  }

  return capBySize(redactSensitive(data), maxChars)
}

/** Redact the values of sensitive query parameters, keeping the parameter names. */
export function redactQueryString(queryString: string): string {
  if (!queryString) return queryString
  const parts = queryString.split('&').map((pair) => {
    const separator = pair.indexOf('=')
    if (separator === -1) return pair
    const name = pair.slice(0, separator)
    return isSensitiveKey(decodeURIComponent(name)) ? `${name}=${REDACTED}` : pair
  })
  return parts.join('&')
}

/**
 * Public inscription links carry a bearer-like token inside the path
 * (`/api/public/inscriptions/<token>/enroll`). Keep the route shape, drop the
 * secret, and redact sensitive query parameters.
 */
export function redactUrl(url: string): string {
  if (!url) return url

  const [rawPath = '', ...rest] = url.split('?')
  const query = rest.join('?')

  const segments = rawPath.split('/')
  const tokenParents = new Set(['inscriptions', 'invitations', 'invites', 'invite', 'reset', 'verify'])
  const path = segments
    .map((segment, index) => {
      const parent = index > 0 ? segments[index - 1]?.toLowerCase() : undefined
      return parent && tokenParents.has(parent) && segment ? REDACTED : segment
    })
    .join('/')

  return query ? `${path}?${redactQueryString(query)}` : path
}

/** Minimal Zod issue shape: everything else on the issue may carry the input value. */
export interface SafeIssue {
  path: string
  code: string
  message?: string
}

function toSafeIssue(candidate: unknown): SafeIssue | null {
  if (!isPlainRecord(candidate)) return null
  if (typeof candidate.code !== 'string' || !Array.isArray(candidate.path)) return null

  const issue: SafeIssue = {
    // Path segments are field names and array indices — never values.
    path: candidate.path.map(segment => String(segment)).join('.'),
    code: candidate.code,
  }
  if (typeof candidate.message === 'string') {
    issue.message = candidate.message.slice(0, MAX_ISSUE_MESSAGE_CHARS)
  }
  return issue
}

/**
 * Turn a Zod `error.issues` array into path + code only. Zod issues can carry
 * the rejected `input` (and `values`/`keys`), i.e. the very DNI or email the
 * user just mistyped — that never leaves the process.
 * Returns `null` when the payload is not an issue array.
 */
export function summarizeZodIssues(data: unknown): SafeIssue[] | null {
  if (!Array.isArray(data) || data.length === 0) return null
  const issues: SafeIssue[] = []
  for (const candidate of data) {
    const issue = toSafeIssue(candidate)
    if (!issue) return null
    issues.push(issue)
  }
  return issues
}

/**
 * Safe rendering of `err.data` for logs and for Sentry `extra`:
 * Zod issues collapse to path + code, anything else goes through the deny list
 * and the size cap.
 */
export function summarizeErrorData(data: unknown): unknown {
  if (data === null || data === undefined) return undefined
  const issues = summarizeZodIssues(data)
  if (issues) return { issues }
  return capBySize(redactSensitive(data), MAX_SERIALIZED_CHARS)
}

/**
 * Structural view of a Sentry event. Declared locally so this module stays
 * dependency-free (and unit-testable without the SDK); every slot we rewrite is
 * typed `unknown` and narrowed at runtime.
 */
export interface RedactableEvent {
  request?: {
    url?: unknown
    data?: unknown
    headers?: unknown
    cookies?: unknown
    query_string?: unknown
  }
  extra?: unknown
  contexts?: unknown
  breadcrumbs?: unknown
  user?: unknown
}

/**
 * Apply the deny list to every slot of a Sentry event that can carry a payload:
 * `request.data` (+ url, headers, cookies, query string), `extra`, `contexts`,
 * `breadcrumbs[].data` and `user`. Mutates in place, as `beforeSend` expects.
 */
export function redactSentryEvent<T extends RedactableEvent>(event: T): T {
  if (!event || typeof event !== 'object') return event

  const request = event.request
  if (isPlainRecord(request)) {
    if (request.data !== undefined) request.data = redactRequestData(request.data)
    if (request.headers !== undefined) request.headers = redactSensitive(request.headers)
    if (request.cookies !== undefined) request.cookies = redactSensitive(request.cookies)
    if (typeof request.query_string === 'string') {
      request.query_string = redactQueryString(request.query_string)
    } else if (request.query_string !== undefined) {
      request.query_string = redactSensitive(request.query_string)
    }
    if (typeof request.url === 'string') request.url = redactUrl(request.url)
  }

  if (event.extra !== undefined) event.extra = redactSensitive(event.extra)
  if (event.contexts !== undefined) event.contexts = redactSensitive(event.contexts)
  if (event.user !== undefined) event.user = redactSensitive(event.user)

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      if (!isPlainRecord(crumb) || crumb.data === undefined) return crumb
      return { ...crumb, data: redactSensitive(crumb.data) }
    })
  }

  return event
}
