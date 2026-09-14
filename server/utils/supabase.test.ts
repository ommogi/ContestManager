import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { H3Event } from 'h3'

// Mock createClient so no test ever opens a real connection.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
    rpc: vi.fn(),
  })),
}))

// Since KAN-55, serverSupabaseAdmin() throws when its env vars are missing
// instead of silently building a client with ''. Every suite below reaches it
// through requireOrgOwner/requireOrgOwnerOrMember, so give it valid-looking
// values. The dedicated guard suite at the bottom removes them on purpose.
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

function mockEvent(user?: any): H3Event {
  return { context: { user } } as unknown as H3Event
}

function createAdminStub(opts: {
  /** organization_id of the contest being gated (null = contest not found) */
  contestOrgId?: string | null
  /** organization ids the caller actually owns */
  ownedOrgIds?: string[]
  memberById?: { id: string; role: string } | null
  memberByEmail?: { id: string; role: string } | null
} = {}) {
  const contestOrgId = opts.contestOrgId === undefined ? 'org-1' : opts.contestOrgId
  const ownedOrgIds = opts.ownedOrgIds ?? []

  const from = vi.fn((table: string) => {
    if (table === 'contests') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: contestOrgId ? { organization_id: contestOrgId } : null,
              error: null,
            })),
          })),
        })),
      }
    }
    if (table === 'organizations') {
      // .select('id').eq('id', orgId).eq('owner_id', userId).maybeSingle()
      const builder: any = {
        eq: vi.fn((col: string, val: string) => {
          if (col === 'id') builder._orgId = val
          if (col === 'owner_id') builder._ownerId = val
          return builder
        }),
        maybeSingle: vi.fn(() => Promise.resolve({
          data: ownedOrgIds.includes(builder._orgId) ? { id: builder._orgId } : null,
          error: null,
        })),
      }
      return { select: vi.fn(() => builder) }
    }
    if (table === 'contest_members') {
      return {
        select: vi.fn(() => {
          const builder: any = {
            eq: vi.fn((col: string, val: string) => {
              if (col === 'user_id') builder._userId = val
              if (col === 'email') builder._email = val
              return builder
            }),
            maybeSingle: vi.fn(() => {
              if (builder._userId) {
                return Promise.resolve({ data: opts.memberById ?? null, error: null })
              }
              if (builder._email) {
                return Promise.resolve({ data: opts.memberByEmail ?? null, error: null })
              }
              return Promise.resolve({ data: null, error: null })
            }),
          }
          return builder
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { from, rpc: vi.fn() }
}

describe('requireOrgOwnerOrMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function loadModule() {
    const mod = await import('./supabase')
    return mod
  }

  it('returns org when user owns the organization that owns the contest', async () => {
    const admin = createAdminStub({ contestOrgId: 'org-1', ownedOrgIds: ['org-1'] })
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(admin as any)

    const { requireOrgOwnerOrMember } = await loadModule()
    const user = { id: 'u1', email: 'u1@example.com' }
    const result = await requireOrgOwnerOrMember(mockEvent(user), 'c1')

    expect(result.org).toEqual({ id: 'org-1' })
    expect(result.member).toBeNull()
  })

  it('returns member when judge invitation is accepted (by user_id)', async () => {
    const admin = createAdminStub({ contestOrgId: 'org-1', ownedOrgIds: [], memberById: { id: 'm1', role: 'judge' } })
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(admin as any)

    const { requireOrgOwnerOrMember } = await loadModule()
    const user = { id: 'u1', email: 'u1@example.com' }
    const result = await requireOrgOwnerOrMember(mockEvent(user), 'c1')

    expect(result.member).toEqual({ id: 'm1', role: 'judge' })
    expect(result.org).toBeNull()
  })

  it('returns member when judge invitation is accepted (by email)', async () => {
    const admin = createAdminStub({ contestOrgId: 'org-1', ownedOrgIds: [], memberById: null, memberByEmail: { id: 'm2', role: 'judge' } })
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(admin as any)

    const { requireOrgOwnerOrMember } = await loadModule()
    const user = { id: 'u1', email: 'u1@example.com' }
    const result = await requireOrgOwnerOrMember(mockEvent(user), 'c1')

    expect(result.member).toEqual({ id: 'm2', role: 'judge' })
  })

  it('throws 403 when judge invitation is pending', async () => {
    const admin = createAdminStub({ contestOrgId: 'org-1', ownedOrgIds: [], memberById: null, memberByEmail: null })
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(admin as any)

    const { requireOrgOwnerOrMember } = await loadModule()
    const user = { id: 'u1', email: 'u1@example.com' }
    await expect(requireOrgOwnerOrMember(mockEvent(user), 'c1')).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'forbidden',
    })
  })

  it('throws 403 when user owns a different org than the one owning the contest', async () => {
    // Regression: owning *any* org must not grant access to another tenant's contest.
    const admin = createAdminStub({
      contestOrgId: 'org-other',
      ownedOrgIds: ['org-mine'],
      memberById: null,
      memberByEmail: null,
    })
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(admin as any)

    const { requireOrgOwnerOrMember } = await loadModule()
    const user = { id: 'u1', email: 'u1@example.com' }
    await expect(requireOrgOwnerOrMember(mockEvent(user), 'c1')).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'forbidden',
    })
  })

  it('throws 401 when user is not authenticated', async () => {
    const { requireOrgOwnerOrMember } = await loadModule()
    await expect(requireOrgOwnerOrMember(mockEvent(undefined as any), 'c1')).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// KAN-43 — a Supabase error must never reach the client on a 500.
// ─────────────────────────────────────────────────────────────────────────────

/** A realistic PostgrestError: a plain object, never an Error instance. */
const PG_ERROR = {
  message: 'insert or update on table "participants" violates foreign key constraint "participants_category_id_fkey"',
  code: '23503',
  details: 'Key (category_id)=(abc) is not present in table "categories".',
  hint: null,
}

function requestEvent(user?: any): H3Event {
  return { context: { user }, method: 'POST', path: '/api/contests/c1/participants' } as unknown as H3Event
}

describe('internalError', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  async function loadInternalError() {
    const { internalError } = await import('./supabase')
    return internalError
  }

  it('answers 500 with the generic code and no trace of the database error', async () => {
    const internalError = await loadInternalError()
    const err = internalError(requestEvent(), PG_ERROR, 'participants.insert')

    expect(err.statusCode).toBe(500)
    expect(err.statusMessage).toBe('internal_error')
    // Nothing the client can read may carry table/column/constraint names.
    const wire = JSON.stringify({ ...err.toJSON(), message: err.message })
    expect(wire).not.toContain('participants_category_id_fkey')
    expect(wire).not.toContain('categories')
    expect(wire).not.toContain('23503')
  })

  it('logs the real message with method, route and operation', async () => {
    const internalError = await loadInternalError()
    internalError(requestEvent(), PG_ERROR, 'participants.insert')

    expect(logSpy).toHaveBeenCalledTimes(1)
    const [prefix, detail] = logSpy.mock.calls[0] as [string, string]
    expect(prefix).toContain('POST')
    expect(prefix).toContain('/api/contests/c1/participants')
    expect(prefix).toContain('participants.insert')
    expect(detail).toContain('code=23503')
    expect(detail).toContain('participants_category_id_fkey')
    expect(detail).toContain('details=Key (category_id)=(abc)')
  })

  it('accepts a different code from the closed set', async () => {
    const internalError = await loadInternalError()
    const err = internalError(requestEvent(), PG_ERROR, 'organizations.delete', 'org_delete_failed')

    expect(err.statusCode).toBe(500)
    expect(err.statusMessage).toBe('org_delete_failed')
  })

  it('only exposes codes from the closed set', async () => {
    const { INTERNAL_ERROR_CODES } = await import('./supabase')
    expect(INTERNAL_ERROR_CODES).toContain('internal_error')
    // Every code is a short snake_case token — never a sentence or a DB message.
    for (const code of INTERNAL_ERROR_CODES) {
      expect(code).toMatch(/^[a-z][a-z_]*$/)
    }
  })

  it('describes Error instances, strings and empty causes without throwing', async () => {
    const internalError = await loadInternalError()

    expect(internalError(requestEvent(), new Error('stripe is down'), 'stripe.retrieve', 'stripe_error').statusMessage)
      .toBe('stripe_error')
    expect(logSpy.mock.calls[0]?.[1]).toBe('stripe is down')

    internalError(requestEvent(), 'round has no resolvable contest', 'rounds.select')
    expect(logSpy.mock.calls[1]?.[1]).toBe('round has no resolvable contest')

    internalError(requestEvent(), null, 'rounds.select')
    expect(logSpy.mock.calls[2]?.[1]).toBe('unknown')
  })

  it('still logs when there is no event context', async () => {
    const internalError = await loadInternalError()
    const err = internalError(null, PG_ERROR, 'organizations.select')

    expect(err.statusMessage).toBe('internal_error')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })
})

describe('requireOrgOwner error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * supabase-js resolves with `{ data, error }` — it does not throw. Mocking it
   * with a rejection would hide exactly the failure mode this helper handles.
   */
  function orgAdminStub(result: { data: unknown; error: unknown }) {
    const builder: any = {
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
    }
    return { from: vi.fn(() => ({ select: vi.fn(() => builder) })), rpc: vi.fn() }
  }

  async function withAdmin(result: { data: unknown; error: unknown }) {
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(orgAdminStub(result) as any)
    const { requireOrgOwner } = await import('./supabase')
    return requireOrgOwner
  }

  it('returns the org when the caller owns one', async () => {
    const org = { id: 'org-1', name: 'Org', slug: 'org', owner_id: 'u1' }
    const requireOrgOwner = await withAdmin({ data: org, error: null })

    const result = await requireOrgOwner(requestEvent({ id: 'u1', email: 'u1@example.com' }))
    expect(result.org).toEqual(org)
  })

  it('throws 500 internal_error — never the Postgres message — when the query fails', async () => {
    const requireOrgOwner = await withAdmin({ data: null, error: PG_ERROR })

    await expect(requireOrgOwner(requestEvent({ id: 'u1' }))).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'internal_error',
    })
    await expect(requireOrgOwner(requestEvent({ id: 'u1' }))).rejects.not.toMatchObject({
      statusMessage: PG_ERROR.message,
    })
  })

  it('keeps the semantic 403 when the caller owns no organization', async () => {
    const requireOrgOwner = await withAdmin({ data: null, error: null })

    await expect(requireOrgOwner(requestEvent({ id: 'u1' }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'org_owner_required',
    })
  })

  it('keeps the 401 when there is no authenticated user', async () => {
    const requireOrgOwner = await withAdmin({ data: null, error: null })

    await expect(requireOrgOwner(requestEvent(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('serverSupabaseAdmin env guard (KAN-55)', () => {
  const ORIGINAL_URL = process.env.SUPABASE_URL
  const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    process.env.SUPABASE_URL = ORIGINAL_URL
    process.env.SUPABASE_SERVICE_KEY = ORIGINAL_KEY
  })

  async function loadAdmin() {
    const { serverSupabaseAdmin } = await import('./supabase')
    return serverSupabaseAdmin
  }

  it('throws naming SUPABASE_SERVICE_KEY when the service key is missing', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    delete process.env.SUPABASE_SERVICE_KEY
    const serverSupabaseAdmin = await loadAdmin()

    expect(() => serverSupabaseAdmin()).toThrow(/SUPABASE_SERVICE_KEY/)
  })

  it('throws naming SUPABASE_SERVICE_KEY when the service key is blank', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = '   '
    const serverSupabaseAdmin = await loadAdmin()

    expect(() => serverSupabaseAdmin()).toThrow(/SUPABASE_SERVICE_KEY/)
  })

  it('throws naming SUPABASE_URL when the url is missing', async () => {
    delete process.env.SUPABASE_URL
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
    const serverSupabaseAdmin = await loadAdmin()

    expect(() => serverSupabaseAdmin()).toThrow(/SUPABASE_URL/)
  })

  it('never builds a client when a variable is missing', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY
    const { createClient } = await import('@supabase/supabase-js')
    const serverSupabaseAdmin = await loadAdmin()

    expect(() => serverSupabaseAdmin()).toThrow()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('builds and memoizes the client when both variables are set', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
    const { createClient } = await import('@supabase/supabase-js')
    const serverSupabaseAdmin = await loadAdmin()

    const first = serverSupabaseAdmin()
    const second = serverSupabaseAdmin()
    expect(first).toBe(second)
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-key',
      expect.anything(),
    )
  })
})
