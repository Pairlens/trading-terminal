// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The URL↔selection sync, driven the way React drives it — which is the
 * point of this file. The effect only re-runs when something it depends
 * on CHANGES, so a pass that changes nothing is the end of the story, not
 * an invitation to try again. A `settle` that re-ran the rule regardless
 * would have declared a green suite over a dead id sitting in the URL
 * forever, which is exactly the bug the browser caught.
 *
 * Every scenario here also has to settle: a rule that oscillates would put
 * the terminal in a navigate loop.
 */
import { describe, expect, test } from 'bun:test'

import { resolveSelectionSync } from '../use-search-selection'

type World = {
  param: string | null
  selected: string | null
  adopted: string | null
  /** Ids the page will accept. Anything else is a stale link. */
  exists: Array<string>
}

/**
 * One pass of the effect, then re-run only if that pass moved something
 * the effect depends on (`param` or `selected`).
 */
function settle(world: World, maxPasses = 10) {
  const trace: Array<string> = []
  for (let pass = 0; pass < maxPasses; pass++) {
    const before = `${world.param}|${world.selected}`
    const step = resolveSelectionSync(world)
    trace.push(step.action === 'idle' ? 'idle' : `${step.action}:${step.id}`)

    if (step.action === 'idle') {
      world.adopted = world.param
      return { world, trace, settled: true }
    }
    if (step.action === 'adopt') {
      world.adopted = step.id
      if (world.exists.includes(step.id)) {
        world.selected = step.id
      } else {
        // Refused. The caller settles it in the same pass rather than
        // waiting for a re-render that will never come.
        trace.push('write:null')
        world.adopted = null
        world.param = null
      }
    } else {
      world.adopted = step.id
      world.param = step.id
    }

    if (`${world.param}|${world.selected}` === before) {
      return { world, trace, settled: true }
    }
  }
  return { world, trace, settled: false }
}

describe('resolveSelectionSync', () => {
  test('a link opens the record it names', () => {
    const { world, trace, settled } = settle({
      param: 'wf-1',
      selected: null,
      adopted: null,
      exists: ['wf-1', 'wf-2'],
    })
    expect(settled).toBe(true)
    expect(world.selected).toBe('wf-1')
    expect(trace).toEqual(['adopt:wf-1', 'idle'])
  })

  test('a selection made on the page is written to the URL', () => {
    const { world, settled } = settle({
      param: 'wf-1',
      selected: 'wf-2',
      adopted: 'wf-1',
      exists: ['wf-1', 'wf-2'],
    })
    expect(settled).toBe(true)
    expect(world.param).toBe('wf-2')
    expect(world.selected).toBe('wf-2')
  })

  test('a page with nothing selected yet publishes its own default', () => {
    const { world, settled } = settle({
      param: null,
      selected: 'bot-7',
      adopted: null,
      exists: ['bot-7'],
    })
    expect(settled).toBe(true)
    expect(world.param).toBe('bot-7')
  })

  test('a link to a deleted record is cleaned out of the address', () => {
    const { world, trace, settled } = settle({
      param: 'wf-gone',
      selected: null,
      adopted: null,
      exists: ['wf-1'],
    })
    expect(settled).toBe(true)
    // Adopted once, refused, then the dead id leaves the URL for good.
    expect(trace).toEqual(['adopt:wf-gone', 'write:null', 'idle'])
    expect(world.param).toBe(null)
    expect(world.selected).toBe(null)
  })

  test('a dead link falls back to whatever is actually open', () => {
    // Arriving at ?workflow=gone while a draft for wf-1 is restored: the
    // address must end up naming what the canvas is really showing, not a
    // record that no longer exists and not a blank.
    const { world, settled } = settle({
      param: 'wf-gone',
      selected: 'wf-1',
      adopted: null,
      exists: ['wf-1'],
    })
    expect(settled).toBe(true)
    expect(world.param).toBe('wf-1')
    expect(world.selected).toBe('wf-1')
  })

  test('the back button re-adopts the previous record', () => {
    // The user is on wf-2; history restores the address that named wf-1.
    const { world, settled } = settle({
      param: 'wf-1',
      selected: 'wf-2',
      adopted: 'wf-2',
      exists: ['wf-1', 'wf-2'],
    })
    expect(settled).toBe(true)
    expect(world.selected).toBe('wf-1')
    expect(world.param).toBe('wf-1')
  })

  test('only a real move earns a history entry', () => {
    // Filling in an address that named nothing is a correction, not a
    // navigation: clicking down a list must not bury the way out.
    const filling = resolveSelectionSync({
      param: null,
      selected: 'wf-1',
      adopted: null,
    })
    expect(filling).toEqual({ action: 'write', id: 'wf-1' })
    expect(filling.action === 'write' && filling.id !== null).toBe(true)

    // Moving between two records is a navigation the back button should
    // walk. Both come through `write`, and the caller tells them apart by
    // whether the address was naming anything.
    const moving = resolveSelectionSync({
      param: 'wf-1',
      selected: 'wf-2',
      adopted: 'wf-1',
    })
    expect(moving).toEqual({ action: 'write', id: 'wf-2' })
  })

  test('an in-step pair does nothing at all', () => {
    expect(
      resolveSelectionSync({
        param: 'a',
        selected: 'a',
        adopted: 'a',
      }),
    ).toEqual({ action: 'idle' })
    expect(
      resolveSelectionSync({ param: null, selected: null, adopted: null }),
    ).toEqual({ action: 'idle' })
  })
})
