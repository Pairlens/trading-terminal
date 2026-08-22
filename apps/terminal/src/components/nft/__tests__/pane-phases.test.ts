// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A pane that enumerates phases must enumerate all of them.
 *
 * `nftPanePhase` collapses four hook flags into one named state, and most panes
 * branch on the name with an explicit list. That is readable and it has one
 * failure mode: adding a phase leaves every existing list silently incomplete,
 * and the pane falls through to its "there are rows" branch and draws an empty
 * table with no explanation.
 *
 * That is exactly what happened when `needsKey` was added. Four Discovery panes
 * kept rendering bare column headers on a board whose real state was "nobody
 * has pasted an API key", while the two panes that branched on `ready` instead
 * of listing failures said so correctly. A source-reading test rather than a
 * render test, in the same spirit as `board-chrome.test.ts`: the mistake is
 * visible in the text and invisible in a passing render.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PANE_DIR = join(import.meta.dir, '..')

/**
 * The pair that must travel together.
 *
 * `unsupported` on its own is legitimate: a pane may gate on "no provider
 * installed" and let everything else fall through. `failed` is different. A
 * pane that distinguishes a failure at all has to distinguish the ONE failure
 * with a fix attached, or the state it misses renders as a blank table.
 */
const PAIRED_PHASES = ['needsKey', 'failed'] as const

function paneSources(): Array<{ name: string; source: string }> {
  return readdirSync(PANE_DIR)
    .filter((f) => f.endsWith('.tsx') && !f.includes('primitives'))
    .map((name) => ({
      name,
      source: readFileSync(join(PANE_DIR, name), 'utf8'),
    }))
}

describe('NFT pane phase handling', () => {
  test('a pane that names a failure also names the one with a fix', () => {
    for (const { name, source } of paneSources()) {
      const named = PAIRED_PHASES.filter((phase) =>
        source.includes(`'${phase}'`),
      )
      if (named.length === 0) continue
      expect(named.slice().sort(), name).toEqual([...PAIRED_PHASES].sort())
    }
  })

  test('at least one pane actually exercises the rule', () => {
    // Guards the guard: if every pane switched to branching on `ready`, the
    // test above would pass vacuously and stop protecting anything.
    const enumerating = paneSources().filter(({ source }) =>
      source.includes(`'failed'`),
    )
    expect(enumerating.length).toBeGreaterThan(0)
  })
})
