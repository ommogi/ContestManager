import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { H3Event } from 'h3'

// Mock createClient so serverSupabaseAdmin never fails on missing env vars
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
    rpc: vi.fn(),
  })),
}))

function mockEvent(user?: any): H3Event {
  return { context: { user } } as unknown as H3Event
}

function createAdminStub(opts: {
  org?: { id: string } | null
  memberById?: { id: string; role: string } | null
  memberByEmail?: { id: string; role: string } | null
} = {}) {
  const from = vi.fn((table: string) => {
    if (table === 'organizations') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: opts.org ?? null, error: null })),
          })),
        })),
      }
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

  it('returns org when user is organization owner', async () => {
    const admin = createAdminStub({ org: { id: 'org-1' } })
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(admin as any)

    const { requireOrgOwnerOrMember } = await loadModule()
    const user = { id: 'u1', email: 'u1@example.com' }
    const result = await requireOrgOwnerOrMember(mockEvent(user), 'c1')

    expect(result.org).toEqual({ id: 'org-1' })
    expect(result.member).toBeNull()
  })

  it('returns member when judge invitation is accepted (by user_id)', async () => {
    const admin = createAdminStub({ org: null, memberById: { id: 'm1', role: 'judge' } })
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(admin as any)

    const { requireOrgOwnerOrMember } = await loadModule()
    const user = { id: 'u1', email: 'u1@example.com' }
    const result = await requireOrgOwnerOrMember(mockEvent(user), 'c1')

    expect(result.member).toEqual({ id: 'm1', role: 'judge' })
    expect(result.org).toBeNull()
  })

  it('returns member when judge invitation is accepted (by email)', async () => {
    const admin = createAdminStub({ org: null, memberById: null, memberByEmail: { id: 'm2', role: 'judge' } })
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue(admin as any)

    const { requireOrgOwnerOrMember } = await loadModule()
    const user = { id: 'u1', email: 'u1@example.com' }
    const result = await requireOrgOwnerOrMember(mockEvent(user), 'c1')

    expect(result.member).toEqual({ id: 'm2', role: 'judge' })
  })

  it('throws 403 when judge invitation is pending', async () => {
    const admin = createAdminStub({ org: null, memberById: null, memberByEmail: null })
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
