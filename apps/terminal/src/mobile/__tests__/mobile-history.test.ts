// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  SHELL_DEPTH_KEY,
  consumePairAdoptionSuppression,
  historyBackSteps,
  planShellMove,
  reconcileHistory,
  resetPairAdoptionLatch,
  shellDepthOf,
  shellEntryCount,
  suppressPairAdoption,
  truncateShell,
} from '../lib/mobile-history'
import type { ShellEntries } from '../lib/mobile-history'

describe('shellDepthOf', () => {
  it('reads the depth a shell entry carries', () => {
    expect(shellDepthOf({ [SHELL_DEPTH_KEY]: 2, __TSR_index: 7 })).toBe(2)
  })

  it('treats every foreign entry as depth zero', () => {
    expect(shellDepthOf(null)).toBe(0)
    expect(shellDepthOf(undefined)).toBe(0)
    expect(shellDepthOf({})).toBe(0)
    expect(shellDepthOf({ [SHELL_DEPTH_KEY]: 'two' })).toBe(0)
    expect(shellDepthOf({ [SHELL_DEPTH_KEY]: -1 })).toBe(0)
    expect(shellDepthOf({ [SHELL_DEPTH_KEY]: Number.NaN })).toBe(0)
  })
})

describe('shellEntryCount', () => {
  it('counts the docked panel and every overlay above it', () => {
    expect(shellEntryCount({ panel: false, overlays: 0 })).toBe(0)
    expect(shellEntryCount({ panel: true, overlays: 0 })).toBe(1)
    expect(shellEntryCount({ panel: true, overlays: 2 })).toBe(3)
  })

  it('ignores a panel that never claimed an entry', () => {
    expect(shellEntryCount({ panel: false, overlays: 1 })).toBe(1)
  })
})

describe('planShellMove', () => {
  const chart: ShellEntries = { panel: false, overlays: 0 }
  const panel: ShellEntries = { panel: true, overlays: 0 }

  it('pushes exactly one entry for the first panel open', () => {
    expect(planShellMove(chart, panel)).toEqual({ push: [1], back: 0 })
  })

  it('adds nothing when one panel replaces another', () => {
    expect(planShellMove(panel, panel)).toEqual({ push: [], back: 0 })
  })

  it('consumes the panel entry on the way back to the bare chart', () => {
    expect(planShellMove(panel, chart)).toEqual({ push: [], back: 1 })
  })

  it('stacks an overlay above the panel', () => {
    expect(planShellMove(panel, { panel: true, overlays: 1 })).toEqual({
      push: [2],
      back: 0,
    })
  })

  it('re-uses an overlay entry when a tab tap replaces it with a panel', () => {
    // Settings over the bare chart, then a tab tap: the stack is one deep
    // either side, so nothing moves and the entry becomes the panel's. A
    // consume-then-push would `go(-1)` and push in the same tick.
    expect(
      planShellMove(
        { panel: false, overlays: 1 },
        { panel: true, overlays: 0 },
      ),
    ).toEqual({ push: [], back: 0 })
  })

  it('walks off every entry a tab tap closes, as one move', () => {
    expect(
      planShellMove({ panel: true, overlays: 2 }, { panel: true, overlays: 0 }),
    ).toEqual({ push: [], back: 2 })
  })

  it('stamps each pushed entry with the depth it represents', () => {
    expect(planShellMove(chart, { panel: true, overlays: 2 })).toEqual({
      push: [1, 2, 3],
      back: 0,
    })
  })
})

describe('truncateShell', () => {
  it('eats the overlays above a docked panel first', () => {
    expect(truncateShell({ panel: true, overlays: 1 }, 1)).toEqual({
      panel: true,
      overlays: 0,
      dismissesPanel: false,
    })
  })

  it('dismisses the panel when its own entry is walked off', () => {
    expect(truncateShell({ panel: true, overlays: 0 }, 0)).toEqual({
      panel: false,
      overlays: 0,
      dismissesPanel: true,
    })
  })

  it('drops the whole shell when back lands on the base entry', () => {
    expect(truncateShell({ panel: true, overlays: 2 }, 0)).toEqual({
      panel: false,
      overlays: 0,
      dismissesPanel: true,
    })
  })

  it('leaves a panel that never claimed an entry alone', () => {
    // The seeded first screen (a `/` deep link opens Discover). Emptying the
    // overlays above it must not dismiss it — it has nothing to walk off.
    expect(truncateShell({ panel: false, overlays: 2 }, 0)).toEqual({
      panel: false,
      overlays: 0,
      dismissesPanel: false,
    })
  })

  it('clamps a depth no entry of ours could have stamped', () => {
    expect(truncateShell({ panel: true, overlays: 1 }, 9)).toEqual({
      panel: true,
      overlays: 1,
      dismissesPanel: false,
    })
    expect(truncateShell({ panel: true, overlays: 1 }, -3)).toEqual({
      panel: false,
      overlays: 0,
      dismissesPanel: true,
    })
  })
})

describe('reconcileHistory', () => {
  it('swallows the popstate a programmatic close causes', () => {
    expect(
      reconcileHistory({ pendingEvents: 1, entryDepth: 0, shellDepth: 2 }),
    ).toEqual({ type: 'consumed' })
  })

  it('pops one overlay when the user presses back', () => {
    expect(
      reconcileHistory({ pendingEvents: 0, entryDepth: 1, shellDepth: 2 }),
    ).toEqual({ type: 'truncate', depth: 1 })
  })

  it('empties the stack when back lands on the base entry', () => {
    expect(
      reconcileHistory({ pendingEvents: 0, entryDepth: 0, shellDepth: 3 }),
    ).toEqual({ type: 'truncate', depth: 0 })
  })

  it('does nothing when the entry and the stack already agree', () => {
    expect(
      reconcileHistory({ pendingEvents: 0, entryDepth: 2, shellDepth: 2 }),
    ).toEqual({ type: 'settled' })
  })

  it('never resurrects a sheet a forward would re-enter', () => {
    expect(
      reconcileHistory({ pendingEvents: 0, entryDepth: 3, shellDepth: 0 }),
    ).toEqual({ type: 'settled' })
  })
})

describe('historyBackSteps', () => {
  it('consumes one entry per sheet dropped', () => {
    expect(historyBackSteps(1, 0)).toBe(1)
    expect(historyBackSteps(3, 0)).toBe(3)
    expect(historyBackSteps(3, 2)).toBe(1)
  })

  it('never walks history when the stack did not shrink', () => {
    expect(historyBackSteps(0, 0)).toBe(0)
    expect(historyBackSteps(1, 2)).toBe(0)
  })
})

/**
 * A pocket browser plus the three calls the provider makes against it, in the
 * order it makes them: `planShellMove` on every commit, `reconcileHistory` on
 * every popstate, `truncateShell` when one turns out to be the user's. Nothing
 * else — the point is that a sequence of taps composes, which no single-call
 * assertion can show.
 */
function shellModel() {
  /** The depth stamped on each entry; index 0 is the app's own base entry. */
  const stamps: Array<number> = [0]
  let index = 0
  let entries: ShellEntries = { panel: false, overlays: 0 }
  let tab: 'chart' | 'panel' = 'chart'
  let pending = 0

  /** One popstate notification, exactly as the provider's subscriber reads it. */
  function popstate() {
    const decision = reconcileHistory({
      pendingEvents: pending,
      entryDepth: index < 0 ? 0 : (stamps[index] ?? 0),
      shellDepth: shellEntryCount(entries),
    })
    if (decision.type === 'consumed') {
      pending -= 1
      return
    }
    if (decision.type === 'settled') return
    const landing = truncateShell(entries, decision.depth)
    entries = { panel: landing.panel, overlays: landing.overlays }
    if (landing.dismissesPanel) tab = 'chart'
  }

  function commit(next: ShellEntries, nextTab: 'chart' | 'panel') {
    const move = planShellMove(entries, next)
    entries = next
    tab = nextTab
    for (const depth of move.push) {
      stamps.length = index + 1 // a push truncates whatever was ahead
      stamps.push(depth)
      index += 1
    }
    if (move.back > 0) {
      pending += 1
      index -= move.back
      popstate() // our own echo
    }
  }

  return {
    /** Tab bar: the user picks a panel. */
    selectPanel: () => commit({ panel: true, overlays: 0 }, 'panel'),
    /** Tab bar: the user picks Chart. */
    selectChart: () => commit({ panel: false, overlays: 0 }, 'chart'),
    /** Tap-the-chart, drag-down, a row that navigates. */
    dismissPanel: () => commit({ ...entries, panel: false }, 'chart'),
    openOverlay: () =>
      commit({ ...entries, overlays: entries.overlays + 1 }, tab),
    closeOverlay: () =>
      commit({ ...entries, overlays: entries.overlays - 1 }, tab),
    /** Hardware back. `exited` once it walks past the app's base entry. */
    back: () => {
      index -= 1
      if (index >= 0) popstate()
    },
    get state() {
      return {
        tab,
        overlays: entries.overlays,
        entries: stamps.length,
        index,
        exited: index < 0,
      }
    },
  }
}

describe('the shell stack end to end', () => {
  it('gives the first panel open one entry, and back dismisses it', () => {
    const m = shellModel()
    m.selectPanel()
    expect(m.state).toMatchObject({ tab: 'panel', entries: 2, index: 1 })

    m.back()
    expect(m.state).toMatchObject({ tab: 'chart', index: 0, exited: false })

    m.back()
    expect(m.state.exited).toBe(true)
  })

  it('keeps exactly one entry however many panels the user visits', () => {
    const m = shellModel()
    m.selectPanel()
    m.selectPanel()
    m.selectPanel()
    expect(m.state).toMatchObject({ tab: 'panel', entries: 2, index: 1 })

    m.back()
    expect(m.state).toMatchObject({ tab: 'chart', index: 0 })
  })

  it('pops the overlay first, then the panel, then leaves', () => {
    const m = shellModel()
    m.selectPanel()
    m.openOverlay()
    expect(m.state).toMatchObject({ tab: 'panel', overlays: 1, index: 2 })

    m.back()
    expect(m.state).toMatchObject({ tab: 'panel', overlays: 0, index: 1 })

    m.back()
    expect(m.state).toMatchObject({ tab: 'chart', overlays: 0, index: 0 })

    m.back()
    expect(m.state.exited).toBe(true)
  })

  it('consumes the entry when the panel is dismissed programmatically', () => {
    const m = shellModel()
    m.selectPanel()
    m.dismissPanel()
    expect(m.state).toMatchObject({ tab: 'chart', index: 0 })

    // No zombie: the next back leaves the app rather than walking a dead entry.
    m.back()
    expect(m.state.exited).toBe(true)
  })

  it('consumes the entry when the Chart tab is tapped', () => {
    const m = shellModel()
    m.selectPanel()
    m.selectChart()
    expect(m.state).toMatchObject({ tab: 'chart', index: 0 })

    m.back()
    expect(m.state.exited).toBe(true)
  })

  it('closes an overlay and its panel in one tab tap, then back leaves', () => {
    const m = shellModel()
    m.selectPanel()
    m.openOverlay()
    m.openOverlay()
    expect(m.state).toMatchObject({ index: 3 })

    m.selectChart()
    expect(m.state).toMatchObject({ tab: 'chart', overlays: 0, index: 0 })

    m.back()
    expect(m.state.exited).toBe(true)
  })

  it('hands an overlay entry to the panel a tab tap opens', () => {
    const m = shellModel()
    m.openOverlay() // Settings over the bare chart
    m.selectPanel() // tab tap: one deep either side, so nothing moves
    expect(m.state).toMatchObject({ tab: 'panel', overlays: 0, index: 1 })

    m.back()
    expect(m.state).toMatchObject({ tab: 'chart', index: 0 })
  })

  it('never resurrects a sheet the chevron closed', () => {
    const m = shellModel()
    m.selectPanel()
    m.openOverlay()
    m.closeOverlay()
    expect(m.state).toMatchObject({ overlays: 0, index: 1 })

    m.back()
    expect(m.state).toMatchObject({ tab: 'chart', overlays: 0, index: 0 })
  })
})

describe('pair adoption latch', () => {
  beforeEach(() => {
    resetPairAdoptionLatch()
  })

  it('is off until the shell moves history', () => {
    expect(consumePairAdoptionSuppression()).toBe(false)
  })

  it('fires exactly once', () => {
    suppressPairAdoption(1_000)
    expect(consumePairAdoptionSuppression(1_010)).toBe(true)
    expect(consumePairAdoptionSuppression(1_020)).toBe(false)
  })

  it('expires rather than suppressing a later navigation', () => {
    suppressPairAdoption(1_000)
    expect(consumePairAdoptionSuppression(60_000)).toBe(false)
  })
})
