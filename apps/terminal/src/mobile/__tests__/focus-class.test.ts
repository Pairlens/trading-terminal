// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every `setFocusedPair` call carries an instrument class.
 *
 * The shell keeps the previous class when a call omits it (`cls ?? prev.cls`
 * in `mobile-terminal-root.tsx`), which is right for a plain re-focus and
 * wrong for a selection surface: picking ETH-USDT from a Featured row while a
 * prediction pair was focused minted `/prediction/okx/ETH-USDT` — the stale
 * class rode into the URL and the venue check for the class went with it.
 *
 * The class is always derivable at the call site — every selection surface
 * holds a row that `entryToInstrumentRef` (or `entryToMarketRef`) can resolve
 * — so a one-argument call is a bug, not a choice. This scan pins that.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'bun:test'

const MOBILE = join(import.meta.dir, '..')

/**
 * Call sites (not the type declaration, not dependency arrays): the name
 * followed by an opening paren. The argument text up to the matching close
 * paren must contain a top-level comma.
 */
const CALL = /setFocusedPair\s*\(/g

function collectFiles(dir: string, out: Array<string> = []): Array<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      collectFiles(full, out)
      continue
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
      out.push(full)
  }
  return out
}

/** The argument list starting after `(`, up to its matching `)`. */
function argumentText(source: string, openParen: number): string {
  let depth = 1
  for (let i = openParen + 1; i < source.length; i++) {
    const ch = source[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return source.slice(openParen + 1, i)
    }
  }
  return source.slice(openParen + 1)
}

/** A comma outside any nested parens/brackets/braces. */
function hasTopLevelComma(args: string): boolean {
  let depth = 0
  for (const ch of args) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) return true
  }
  return false
}

describe('mobile focus class', () => {
  const files = collectFiles(MOBILE)

  test('the scan actually reads the mobile tree', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  test('every setFocusedPair call passes an instrument class', () => {
    const offenders: Array<string> = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      CALL.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = CALL.exec(source)) !== null) {
        const openParen = match.index + match[0].length - 1
        const args = argumentText(source, openParen)
        if (!hasTopLevelComma(args)) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push(`${relative(MOBILE, file)}:${line}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test('the scan still sees real call sites', () => {
    // If the pattern rots, the offender test above passes vacuously.
    let calls = 0
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      CALL.lastIndex = 0
      while (CALL.exec(source) !== null) calls++
    }
    expect(calls).toBeGreaterThanOrEqual(5)
  })
})
