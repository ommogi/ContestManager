// Guards against the gate regression found in October 2026: 42 endpoints used
// requireOrgOwnerOrMember, which admits any accepted contest member — judges
// included — so a judge could delete categories, promote, or read minors' DNI.
//
// requireOrgOwnerOrMember is now only a building block for the role-aware
// helpers in ./supabase. No endpoint may call it directly.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const API_DIR = join(__dirname, '..', 'api')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : []
  })
}

describe('endpoint gates', () => {
  const files = walk(API_DIR).filter(f => !f.endsWith('.test.ts'))

  it('finds the endpoints', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no endpoint calls requireOrgOwnerOrMember directly', () => {
    const offenders = files
      .filter(f => /\brequireOrgOwnerOrMember\s*\(/.test(readFileSync(f, 'utf8')))
      .map(f => relative(API_DIR, f))
    expect(offenders).toEqual([])
  })
})
