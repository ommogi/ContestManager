import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleBundle,
  handleTicketsTopup,
  handleActivationsTopup,
  handleEnrollment,
} from './stripe-webhook'
import type { SupabaseAdmin } from './stripe-webhook'

// Mock email util
vi.mock('~~/server/utils/email', () => ({
  sendEnrollmentEmail: vi.fn().mockResolvedValue({ sent: true, id: 'email-123' }),
}))

/**
 * Every write the handler makes, recorded per table.
 *
 * Shared by the enrollment tests so the form-response assertions can prove
 * *which* statement ran — an upsert with an onConflict target, not an insert.
 */
interface AdminCalls {
  upserts: Array<{ table: string; values: any; options: any }>
  inserts: Array<{ table: string; values: any }>
  updates: Array<{ table: string; values: any }>
}

function createMockAdmin(overrides: {
  rpc?: (name: string, args: any) => Promise<{ data?: any; error?: any }>
  fromSelectSingle?: any
  /** Row returned by `pending_form_responses … maybeSingle()`. */
  pendingRow?: any
  calls?: AdminCalls
} = {}): SupabaseAdmin {
  const rpcFn = overrides.rpc ?? (() => Promise.resolve({ data: null, error: null }))
  const calls = overrides.calls
  return {
    rpc: vi.fn(rpcFn),
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: overrides.fromSelectSingle ?? null, error: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: overrides.pendingRow ?? null, error: null })),
        })),
      })),
      update: vi.fn((values: any) => {
        calls?.updates.push({ table, values })
        return { eq: vi.fn(() => Promise.resolve({ error: null })) }
      }),
      insert: vi.fn((values: any) => {
        calls?.inserts.push({ table, values })
        return Promise.resolve({ error: null })
      }),
      upsert: vi.fn((values: any, options: any) => {
        calls?.upserts.push({ table, values, options })
        return Promise.resolve({ error: null })
      }),
    })),
  } as unknown as SupabaseAdmin
}

function emptyCalls(): AdminCalls {
  return { upserts: [], inserts: [], updates: [] }
}

function sessionBase(payment_status: string, metadata: Record<string, string> = {}): any {
  return {
    id: 'cs_test_123',
    payment_status,
    amount_total: 1000,
    metadata,
    payment_intent: 'pi_123',
    customer_email: 'test@example.com',
    customer_details: { email: 'test@example.com' },
  }
}

function eventBase(type: string, object: any): any {
  return { id: 'evt_123', type, data: { object } }
}

describe('handleBundle', () => {
  it('ignores missing metadata', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', {})
    const res = await handleBundle(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'missing_metadata' })
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('ignores unpaid sessions', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('unpaid', { organization_id: 'org-1', plan: 'starter' })
    const res = await handleBundle(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'payment_status:unpaid' })
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('credits bundle on paid session', async () => {
    const admin = createMockAdmin({ rpc: () => Promise.resolve({ data: null, error: null }) })
    const session = sessionBase('paid', { organization_id: 'org-1', plan: 'pro' })
    const res = await handleBundle(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ credited: true })
    expect(admin.rpc).toHaveBeenCalledWith('credit_bundle', {
      p_org_id: 'org-1',
      p_plan: 'pro',
      p_stripe_session_id: 'cs_test_123',
      p_stripe_event_id: 'evt_123',
    })
  })

  it('throws on RPC error', async () => {
    const admin = createMockAdmin({ rpc: () => Promise.resolve({ data: null, error: { message: 'db fail' } }) })
    const session = sessionBase('paid', { organization_id: 'org-1', plan: 'starter' })
    await expect(
      handleBundle(admin, eventBase('checkout.session.completed', session), session)
    ).rejects.toThrow('credit_bundle: db fail')
  })
})

describe('handleTicketsTopup', () => {
  it('ignores missing metadata', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', { organization_id: 'org-1' })
    const res = await handleTicketsTopup(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'missing_metadata' })
  })

  it('credits tickets on paid session', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', { organization_id: 'org-1', quantity: '10' })
    const res = await handleTicketsTopup(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ credited_tickets: 10 })
    expect(admin.rpc).toHaveBeenCalledWith('credit_tickets', expect.objectContaining({
      p_org_id: 'org-1',
      p_quantity: 10,
      p_price_cents: 1000,
    }))
  })
})

describe('handleActivationsTopup', () => {
  it('credits activations on paid session', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', { organization_id: 'org-1', quantity: '5' })
    const res = await handleActivationsTopup(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ credited_activations: 5 })
    expect(admin.rpc).toHaveBeenCalledWith('credit_activations', expect.objectContaining({
      p_org_id: 'org-1',
      p_quantity: 5,
      p_price_cents: 1000,
    }))
  })
})

describe('handleEnrollment', () => {
  it('ignores unpaid sessions', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('unpaid', { token: 'tok', user_id: 'u1', category_id: 'c1' })
    const res = await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'payment_status:unpaid' })
  })

  it('ignores missing enrollment metadata', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', { token: 'tok', user_id: 'u1' })
    const res = await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'missing_enrollment_metadata' })
  })

  it('enrolls paid participant and sends email', async () => {
    const admin = createMockAdmin({
      rpc: () => Promise.resolve({ data: 'part-123', error: null }),
      fromSelectSingle: {
        first_name: 'Ana',
        contests: { name: 'Concurso X', slug: 'concurso-x' },
        categories: { name: 'Categoría A' },
        amount_paid_cents: 1500,
      },
    })
    const session = sessionBase('paid', {
      token: 'tok',
      user_id: 'u1',
      category_id: 'c1',
      first_name: 'Ana',
      last_name: 'García',
      birthdate: '2000-01-01',
      email: 'ana@example.com',
    })
    const res = await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ participant_id: 'part-123' })
    expect(admin.rpc).toHaveBeenCalledWith('enroll_participant_paid', expect.objectContaining({
      p_user_id: 'u1',
      p_token: 'tok',
      p_category_id: 'c1',
      p_email: 'ana@example.com',
      p_amount_cents: 1000,
    }))
  })

  it('throws on RPC error', async () => {
    const admin = createMockAdmin({ rpc: () => Promise.resolve({ data: null, error: { message: 'dup' } }) })
    const session = sessionBase('paid', { token: 'tok', user_id: 'u1', category_id: 'c1' })
    await expect(
      handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    ).rejects.toThrow('enroll_participant_paid: dup')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Configurable form answers on the paid path (KAN-49)
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_ID = 'ssssssss-0000-4000-8000-000000000001'
const CONTEST_ID = 'cccccccc-0000-4000-8000-000000000001'
const USER_ID = 'u1'

function enrollmentSession(extraMetadata: Record<string, string> = {}) {
  return sessionBase('paid', {
    token: 'tok',
    contest_id: CONTEST_ID,
    user_id: USER_ID,
    category_id: 'c1',
    first_name: 'Ana',
    last_name: 'García',
    birthdate: '2000-01-01',
    email: 'ana@example.com',
    ...extraMetadata,
  })
}

describe('handleEnrollment · form responses', () => {
  it('writes nothing to participant_form_responses without a form_draft_id', async () => {
    // A contest with no published form must behave exactly as it did before.
    const calls = emptyCalls()
    const admin = createMockAdmin({ rpc: () => Promise.resolve({ data: 'part-1', error: null }), calls })
    const session = enrollmentSession()
    await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)

    expect(calls.upserts).toHaveLength(0)
    expect(calls.inserts.filter(c => c.table === 'participant_form_responses')).toHaveLength(0)
  })

  it('resolves the draft and stores the answers against the participant', async () => {
    const calls = emptyCalls()
    const admin = createMockAdmin({
      rpc: () => Promise.resolve({ data: 'part-1', error: null }),
      pendingRow: { contest_id: CONTEST_ID, form_schema_id: SCHEMA_ID, responses_json: { bio: 'hola', talla: 'M' } },
      calls,
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })
    const res = await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)

    expect(res).toEqual({ participant_id: 'part-1' })
    expect(calls.upserts).toEqual([{
      table: 'participant_form_responses',
      values: {
        participant_id: 'part-1',
        form_schema_id: SCHEMA_ID,
        responses_json: { bio: 'hola', talla: 'M' },
      },
      options: { onConflict: 'participant_id,form_schema_id' },
    }])
    // The draft is stamped, not deleted — a later redelivery can still read it.
    expect(calls.updates.some(c => c.table === 'pending_form_responses' && c.values.consumed_at))
      .toBe(true)
  })

  it('carries a 5.000-character answer through without it ever entering metadata', async () => {
    const long = 'á'.repeat(5000)
    const calls = emptyCalls()
    const admin = createMockAdmin({
      rpc: () => Promise.resolve({ data: 'part-1', error: null }),
      pendingRow: { contest_id: CONTEST_ID, form_schema_id: SCHEMA_ID, responses_json: { bio: long } },
      calls,
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })

    // Stripe's own cap: 50 keys, 40-char keys, 500-char values. The long answer
    // travels in the database row, so the session stays inside all three.
    const metadata = session.metadata as Record<string, string>
    expect(Object.keys(metadata).length).toBeLessThanOrEqual(50)
    for (const [key, value] of Object.entries(metadata)) {
      expect(key.length).toBeLessThanOrEqual(40)
      expect(String(value).length).toBeLessThanOrEqual(500)
    }

    await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)

    expect(calls.upserts[0]!.values.responses_json.bio).toHaveLength(5000)
  })

  it('does not duplicate rows when Stripe redelivers the same event', async () => {
    // `enroll_participant_paid` is idempotent by session id, so the redelivery
    // arrives with the same participant. The write must be an upsert on the
    // unique pair or the retry would raise 23505 and 500 forever.
    const calls = emptyCalls()
    const admin = createMockAdmin({
      rpc: () => Promise.resolve({ data: 'part-1', error: null }),
      pendingRow: { contest_id: CONTEST_ID, form_schema_id: SCHEMA_ID, responses_json: { bio: 'hola' } },
      calls,
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })
    const evt = eventBase('checkout.session.completed', session)

    const first = await handleEnrollment(admin, evt, session)
    const second = await handleEnrollment(admin, evt, session)

    expect(second).toEqual(first)
    expect(calls.inserts.filter(c => c.table === 'participant_form_responses')).toHaveLength(0)
    expect(calls.upserts).toHaveLength(2)
    for (const call of calls.upserts) {
      expect(call.table).toBe('participant_form_responses')
      expect(call.options).toEqual({ onConflict: 'participant_id,form_schema_id' })
      expect(call.values).toEqual({
        participant_id: 'part-1',
        form_schema_id: SCHEMA_ID,
        responses_json: { bio: 'hola' },
      })
    }
  })

  it('keeps the paid enrollment when the draft has vanished', async () => {
    // Retrying cannot resurrect a pruned draft; failing here would only make
    // Stripe redeliver something that can never succeed.
    const calls = emptyCalls()
    const admin = createMockAdmin({
      rpc: () => Promise.resolve({ data: 'part-1', error: null }),
      pendingRow: null,
      calls,
    })
    const session = enrollmentSession({ form_draft_id: 'draft-gone' })
    const res = await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)

    expect(res).toEqual({ participant_id: 'part-1' })
    expect(calls.upserts).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Confirming the uploaded files on the paid path (KAN-49)
// ─────────────────────────────────────────────────────────────────────────────
//
// The webhook is the only moment on this path where the participant row
// exists, so it is the only moment the files uploaded before Checkout can be
// attached to it. Until `confirm_inscription_uploads` runs they stay `pending`
// in `inscription_uploads` and the orphan sweep marks them purgeable after 24
// hours — a PAID inscription whose answers point at deleted objects.

const UPLOAD_PATH = `${CONTEST_ID}/${USER_ID}/partitura/11111111-2222-4333-8444-555555555555-obra.pdf`

function fileRef(path: string) {
  return { path, name: 'obra.pdf', size: 2048, mimeType: 'application/pdf', uploadedAt: '2026-05-01T10:00:00Z' }
}

/**
 * Records every RPC and resolves — never rejects — exactly like supabase-js.
 * A mock that threw would let a missing `if (error)` check pass.
 */
function recordingRpc(opts: { confirmError?: { message: string } } = {}) {
  const rpcs: Array<{ fn: string; args: any }> = []
  const rpc = (fn: string, args: any) => {
    rpcs.push({ fn, args })
    if (fn === 'confirm_inscription_uploads') {
      return Promise.resolve({
        data: opts.confirmError ? null : (args.p_paths as string[]).length,
        error: opts.confirmError ?? null,
      })
    }
    return Promise.resolve({ data: 'part-1', error: null })
  }
  return { rpc, rpcs }
}

const confirmCalls = (rpcs: Array<{ fn: string; args: any }>) =>
  rpcs.filter(c => c.fn === 'confirm_inscription_uploads')

describe('handleEnrollment · confirming uploads', () => {
  it('attaches the referenced files to the participant that was just created', async () => {
    const { rpc, rpcs } = recordingRpc()
    const admin = createMockAdmin({
      rpc,
      pendingRow: {
        contest_id: CONTEST_ID,
        form_schema_id: SCHEMA_ID,
        responses_json: { partitura: [fileRef(UPLOAD_PATH)] },
      },
      calls: emptyCalls(),
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })
    await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)

    expect(confirmCalls(rpcs)).toEqual([{
      fn: 'confirm_inscription_uploads',
      args: {
        p_contest_id: CONTEST_ID,
        p_user_id: USER_ID,
        p_participant_id: 'part-1',
        p_paths: [UPLOAD_PATH],
      },
    }])
  })

  it('confirms with an empty list when the form referenced no file, to purge the discards', async () => {
    const { rpc, rpcs } = recordingRpc()
    const admin = createMockAdmin({
      rpc,
      pendingRow: { contest_id: CONTEST_ID, form_schema_id: SCHEMA_ID, responses_json: { bio: 'hola' } },
      calls: emptyCalls(),
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })
    await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)

    expect(confirmCalls(rpcs)).toHaveLength(1)
    expect(confirmCalls(rpcs)[0]!.args.p_paths).toEqual([])
  })

  it('does not touch the RPC for a contest with no published form', async () => {
    const { rpc, rpcs } = recordingRpc()
    const admin = createMockAdmin({ rpc, calls: emptyCalls() })
    const session = enrollmentSession()
    await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    expect(confirmCalls(rpcs)).toHaveLength(0)
  })

  it('does not touch the RPC when the draft has vanished', async () => {
    const { rpc, rpcs } = recordingRpc()
    const admin = createMockAdmin({ rpc, pendingRow: null, calls: emptyCalls() })
    const session = enrollmentSession({ form_draft_id: 'draft-gone' })
    await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    expect(confirmCalls(rpcs)).toHaveLength(0)
  })

  it('throws so Stripe redelivers when referenced files could not be confirmed', async () => {
    // The alternative is a paid inscription whose files the orphan sweep
    // deletes 24 hours later. Every write in the handler is idempotent, so a
    // redelivery repairs rather than duplicates.
    const { rpc } = recordingRpc({ confirmError: { message: 'deadlock detected' } })
    const admin = createMockAdmin({
      rpc,
      pendingRow: {
        contest_id: CONTEST_ID,
        form_schema_id: SCHEMA_ID,
        responses_json: { partitura: [fileRef(UPLOAD_PATH)] },
      },
      calls: emptyCalls(),
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })
    await expect(
      handleEnrollment(admin, eventBase('checkout.session.completed', session), session),
    ).rejects.toThrow('confirm_inscription_uploads: deadlock detected')
  })

  it('absorbs the failure when nothing was referenced: only the early purge is missed', async () => {
    // The orphan sweep purges those uploads anyway after the TTL. Making
    // Stripe redeliver a paid event over that would be disproportionate.
    const { rpc } = recordingRpc({ confirmError: { message: 'deadlock detected' } })
    const admin = createMockAdmin({
      rpc,
      pendingRow: { contest_id: CONTEST_ID, form_schema_id: SCHEMA_ID, responses_json: { bio: 'hola' } },
      calls: emptyCalls(),
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })
    await expect(
      handleEnrollment(admin, eventBase('checkout.session.completed', session), session),
    ).resolves.toEqual({ participant_id: 'part-1' })
  })

  it('leaves the draft unconsumed when confirmation failed, so the retry can read it', async () => {
    const calls = emptyCalls()
    const { rpc } = recordingRpc({ confirmError: { message: 'boom' } })
    const admin = createMockAdmin({
      rpc,
      pendingRow: {
        contest_id: CONTEST_ID,
        form_schema_id: SCHEMA_ID,
        responses_json: { partitura: [fileRef(UPLOAD_PATH)] },
      },
      calls,
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })
    await expect(
      handleEnrollment(admin, eventBase('checkout.session.completed', session), session),
    ).rejects.toThrow()

    expect(calls.updates.filter(c => c.table === 'pending_form_responses')).toHaveLength(0)
  })

  it('is a no-op on redelivery: the same call twice, never a second participant', async () => {
    // `confirm_inscription_uploads` filters on `confirmed_at IS NULL`, so the
    // second run confirms nothing and the ledger is unchanged.
    const { rpc, rpcs } = recordingRpc()
    const admin = createMockAdmin({
      rpc,
      pendingRow: {
        contest_id: CONTEST_ID,
        form_schema_id: SCHEMA_ID,
        responses_json: { partitura: [fileRef(UPLOAD_PATH)] },
      },
      calls: emptyCalls(),
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1' })
    const evt = eventBase('checkout.session.completed', session)

    const first = await handleEnrollment(admin, evt, session)
    const second = await handleEnrollment(admin, evt, session)

    expect(second).toEqual(first)
    const confirms = confirmCalls(rpcs)
    expect(confirms).toHaveLength(2)
    expect(confirms[0]!.args).toEqual(confirms[1]!.args)
  })

  it('confirms the contest the draft was written against, not the session metadata', async () => {
    // The draft row is server-written and is what the answers were validated
    // against; the metadata is only a pointer.
    const { rpc, rpcs } = recordingRpc()
    const admin = createMockAdmin({
      rpc,
      pendingRow: {
        contest_id: CONTEST_ID,
        form_schema_id: SCHEMA_ID,
        responses_json: { partitura: [fileRef(UPLOAD_PATH)] },
      },
      calls: emptyCalls(),
    })
    const session = enrollmentSession({ form_draft_id: 'draft-1', contest_id: 'otro-concurso' })
    await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)

    expect(confirmCalls(rpcs)[0]!.args.p_contest_id).toBe(CONTEST_ID)
  })
})
