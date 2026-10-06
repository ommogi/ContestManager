// supabase/seed/load_demo.mjs
// Loads the demo data produced by generate_demo.py through the Supabase API,
// with the service key from .env. Same data as demo.sql, for when running raw
// SQL is not at hand.
//
//   node supabase/seed/load_demo.mjs            # loads
//   node supabase/seed/load_demo.mjs --check    # only verifies, changes nothing
//
// WARNING: deletes every contest (and the works catalogue) of the demo
// organisation before loading. No other organisation is touched. Re-running
// lands on the same state: every id is fixed.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const url = env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env')

const data = JSON.parse(execFileSync('python3', [join(here, 'generate_demo.py'), '--json'], { encoding: 'utf8' }))
const db = createClient(url, key, { auth: { persistSession: false } })
const checkOnly = process.argv.includes('--check')

function fail(step, error) {
  console.error(`✗ ${step}:`, error.message ?? error)
  process.exit(1)
}

// 0. Guard: the demo accounts and organisation exist.
const { data: profiles, error: pErr } = await db.from('profiles').select('id').in('id', data.demo_user_ids)
if (pErr) fail('profiles', pErr)
if ((profiles ?? []).length !== data.demo_user_ids.length) fail('guard', new Error('missing demo accounts'))
const { data: org, error: oErr } = await db.from('organizations').select('id, name').eq('id', data.org).maybeSingle()
if (oErr || !org) fail('guard', oErr ?? new Error('demo organisation not found'))
console.log(`✓ demo accounts and organisation "${org.name}" found`)

const { count } = await db.from('contests').select('id', { count: 'exact', head: true }).eq('organization_id', data.org)
console.log(`  ${count} contest(s) would be replaced; ${data.tables.map(([t, r]) => `${r.length} ${t}`).join(', ')}`)
if (checkOnly) process.exit(0)

// 1. Clean the demo organisation (cascades to categories, rounds, participants, scores…).
for (const table of ['contests', 'works', 'composers']) {
  const { error } = await db.from(table).delete().eq('organization_id', data.org)
  if (error) fail(`delete ${table}`, error)
}
console.log('✓ previous demo data deleted')

// 2. Organisation and profile names.
{
  const { error } = await db.from('organizations').update(data.org_update).eq('id', data.org)
  if (error) fail('organization', error)
  for (const [id, full_name] of Object.entries(data.profiles)) {
    const { error: e } = await db.from('profiles').update({ full_name }).eq('id', id)
    if (e) fail('profiles', e)
  }
}

// 3. Rows, in dependency order, in chunks.
for (const [table, rows] of data.tables) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 200), { onConflict: 'id' })
    if (error) fail(`insert ${table}`, error)
  }
  console.log(`✓ ${rows.length} ${table}`)
}

// 4. Judges: the insert trigger leaves them pending; the demo jury has accepted.
{
  const { error } = await db.from('contest_members')
    .update({ invitation_status: 'accepted', responded_at: '2026-09-01T12:00:00+02:00', invitation_token: null, invitation_expires_at: null })
    .in('contest_id', data.accept_judges_in)
  if (error) fail('accept judges', error)
}

// 5. In-app notifications the triggers just created: the demo starts clean.
{
  const { error } = await db.from('notifications').delete().in('user_id', data.demo_user_ids)
  if (error) fail('notifications', error)
}

console.log('✓ demo loaded')
