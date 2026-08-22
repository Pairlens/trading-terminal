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
 * Phases that mean "there is nothing to draw and here is why". A pane naming
 * any one of them must name all of them, or the ones it missed render as a
 * blank table.
 */
const FALLBACK_PHASES = ['unsupported', 'needsKey', 'failed'] as const

function paneSources(): Array<{ name: string; source: string }> {
  return readdirSync(PANE_DIR)
    .filter((f) => f.endsWith('.tsx') && !f.includes('primitives'))
    .map((name) => ({
      name,
      source: readFileSync(join(PANE_DIR, name), 'utf8'),
    }))
}

describe('NFT pane phase handling', () => {
  test('a pane naming one fallback phase names every fallback phase', () => {
    for (const { name, source } of paneSources()) {
      const named = FALLBACK_PHASES.filter((phase) =>
        source.includes(`'${phase}'`),
      )
      if (named.length === 0) continue
      expect(named.slice().sort(), name).toEqual(
        [...FALLBACK_PHASES].sort(),
      )
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
