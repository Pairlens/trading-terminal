// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The invariant a memecoin pane's loading state rests on, read off the source.
 *
 * `SkeletonStatus` is a screen-reader line and nothing else. Every one of these
 * panes rendered it ALONE for a release, which meant a loading pane drew an
 * empty rectangle: the same shape the board uses for "nothing is minting", so a
 * working board looked like a failed one and then rebuilt itself under the
 * reader when the rows landed. Nothing about that is visible in a type error or
 * a runtime warning, and it reproduces only against a cold, slow feed.
 *
 * The other half is geometry. The ghosts stand in for cells whose widths are
 * measured constants, and a ghost that hardcodes its own copy of one drifts the
 * moment the real cell changes: an auto-layout table takes its column widths
 * from its content, so the column jumps the instant the first real row lands.
 *
 * If you are here because this failed: give the pane a skeleton (see
 * `memecoin-skeletons.tsx`), or import the width rather than retyping it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const DIR = join(import.meta.dir, '..')

const read = (file: string): string =>
  readFileSync(join(DIR, file), 'utf8').replaceAll('\r\n', '\n')

/** Every file here that renders a pane with a loading state of its own. */
const PANES = ['launchpad-column-pane.tsx', 'memecoin-token-panes.tsx']

describe('memecoin loading states', () => {
  for (const file of PANES) {
    test(`${file} draws a skeleton, not just the screen-reader line`, () => {
      const source = read(file)
      expect(source).toContain('SkeletonStatus')
      expect(source).toContain('memecoin-skeletons')
    })
  }

  test('the columns keep their table and headers while loading', () => {
    // The header row is furniture rather than data, so it is known from the
    // first frame. Gating the whole `<table>` on rows arriving is what made the
    // pane rebuild itself instead of filling in.
    const source = read('launchpad-column-pane.tsx')
    expect(source).toContain('{isLoading || rows.length > 0 ? (')
    expect(source).toContain('<LaunchpadGhostRows stage={stage}')
  })

  test('the ghosts are sized to the pane and fade out at its bottom', () => {
    // A fixed row count drew a block of placeholders across the top of a
    // full-height column and stopped, which reads as a column that has
    // answered and found sixteen rows. The count is measured now, and the
    // stack is masked at the bottom so wherever it ends is a list running out
    // of sight rather than a hard edge.
    const pane = read('launchpad-column-pane.tsx')
    expect(pane).toContain('useGhostRowCount(scrollRef, isLoading)')
    expect(pane).toContain('rows={ghostRows}')
    expect(pane).toContain('skeleton-fade')
    // The sweep depth and the mask read the same number. Two copies drift, and
    // the seam where the highlight stops comes back mid-pane.
    expect(pane).toContain('--skeleton-fade-start')
    expect(pane).toContain('GHOST_FADE_START')
    const skeletons = read('memecoin-skeletons.tsx')
    expect(skeletons).toContain('export const GHOST_FADE_START')
    expect(skeletons).toContain('const GHOST_SWEEP_DEPTH = GHOST_FADE_START')
  })

  test('each token pane passes its OWN shape to the frame', () => {
    // One generic placeholder for a list of stats AND a four-row table reflows
    // whichever of the two it guessed wrong.
    const source = read('memecoin-token-panes.tsx')
    expect(source.match(/skeleton=\{/g) ?? []).toHaveLength(3)
  })

  test('the ghosts import the cell widths they stand in for', () => {
    const source = read('memecoin-skeletons.tsx')
    expect(source).toContain('CURVE_CELL_WIDTH')
    expect(source).toContain('FLOW_CELL')
    // A second copy of either number is the drift this test exists to catch.
    expect(source).not.toContain('w-[68px]')
    expect(source).not.toContain('width: 74')
  })

  test('the flow pill and the curve cell publish one width each', () => {
    const source = read('memecoin-pane-primitives.tsx')
    expect(source).toContain('export const FLOW_CELL')
    expect(source).toContain('export const CURVE_CELL_WIDTH = 74')
    // The curve's unknown state claims the same width from the same constant
    // rather than repeating it.
    expect(source).toContain('style={{ width: CURVE_CELL_WIDTH }}')
  })
})
