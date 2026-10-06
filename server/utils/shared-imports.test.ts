// Guards against the promote regression found in October 2026: the endpoint
// called carryDrawNumbers from shared/round-draw.ts without importing it. Nuxt
// only auto-imports shared/utils and shared/types, so the build passed and every
// promotion failed at runtime, after the round had already been closed.
//
// Any function exported by a top-level shared/*.ts file that a server file
// calls must be imported (or defined) in that file.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SERVER_DIR = join(__dirname, '..')
const SHARED_DIR = join(__dirname, '..', '..', 'shared')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : []
  })
}

function sharedExports(): string[] {
  const names = new Set<string>()
  for (const name of readdirSync(SHARED_DIR)) {
    if (!name.endsWith('.ts')) continue
    const src = readFileSync(join(SHARED_DIR, name), 'utf8')
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]!)
    for (const m of src.matchAll(/^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/gm)) names.add(m[1]!)
  }
  return [...names]
}

function boundNames(src: string): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const part of m[1]!.split(',')) {
      const local = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, '').trim()
      if (local) names.add(local)
    }
  }
  for (const m of src.matchAll(/\b(?:function|const|let|var)\s+(\w+)/g)) names.add(m[1]!)
  return names
}

describe('shared imports', () => {
  const files = walk(SERVER_DIR).filter(f => !f.endsWith('.test.ts'))
  const exported = sharedExports()

  it('finds the shared helpers', () => {
    expect(exported).toContain('carryDrawNumbers')
  })

  it('every shared helper a server file calls is imported there', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      const bound = boundNames(src)
      for (const name of exported) {
        if (new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(src) && !bound.has(name)) {
          offenders.push(`${relative(SERVER_DIR, file)}: ${name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
