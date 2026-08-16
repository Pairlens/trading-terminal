// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  SPOTLIGHT_DURATION_MS,
  listSpotlightTargets,
  requestPendingSpotlight,
  useAiSpotlightStore,
} from '../ai-spotlight-store'

const store = () => useAiSpotlightStore.getState()

const target = (id: string) => ({
  id,
  label: id,
  description: `The ${id}.`,
})

const isLit = (id: string) => store().request?.targetId === id

beforeEach(() => {
  useAiSpotlightStore.setState({ targets: {}, request: null })
})

afterEach(() => {
  store().clear()
})

describe('targets', () => {
  it('lists what is mounted and drops it on unmount', () => {
    const withdraw = store().registerTarget('a', target('pane:chart'))
    expect(listSpotlightTargets().map((t) => t.id)).toEqual(['pane:chart'])
    withdraw()
    expect(listSpotlightTargets()).toEqual([])
  })

  it('keeps a shared id listed until the LAST instance unmounts', () => {
    // Two chart panes publish the same model-facing id. Keying the
    // registry by that id made the second pane's unmount withdraw the
    // first pane's entry, leaving a mounted pane unlistable.
    const withdrawFirst = store().registerTarget('a', target('pane:chart'))
    const withdrawSecond = store().registerTarget('b', target('pane:chart'))

    withdrawSecond()
    expect(listSpotlightTargets().map((t) => t.id)).toEqual(['pane:chart'])
    expect(store().highlight('pane:chart')).toBe(true)

    withdrawFirst()
    expect(listSpotlightTargets()).toEqual([])
  })

  it('offers a shared id once, not once per instance', () => {
    store().registerTarget('a', target('pane:chart'))
    store().registerTarget('b', target('pane:chart'))
    expect(listSpotlightTargets()).toHaveLength(1)
  })
})

describe('highlight', () => {
  it('refuses an id nobody publishes, and lights one that is mounted', () => {
    expect(store().highlight('pane:nowhere')).toBe(false)
    expect(store().request).toBeNull()

    store().registerTarget('a', target('pane:chart'))
    expect(store().highlight('pane:chart')).toBe(true)
    expect(isLit('pane:chart')).toBe(true)
  })

  it('points at one thing at a time', () => {
    store().registerTarget('a', target('pane:chart'))
    store().registerTarget('b', target('pane:orderbook'))

    store().highlight('pane:chart')
    store().highlight('pane:orderbook')

    expect(isLit('pane:orderbook')).toBe(true)
    expect(isLit('pane:chart')).toBe(false)
  })

  it('moves the expiry when the same target is re-lit', () => {
    store().registerTarget('a', target('pane:chart'))
    store().highlight('pane:chart', { durationMs: 1000 })
    const first = store().request?.expiresAt ?? 0

    store().highlight('pane:chart', { durationMs: 5000 })
    expect(store().request?.expiresAt ?? 0).toBeGreaterThan(first)
  })

  it('retires itself once the window has passed', async () => {
    store().registerTarget('a', target('pane:chart'))
    store().highlight('pane:chart', { durationMs: 30 })
    expect(isLit('pane:chart')).toBe(true)

    await Bun.sleep(80)
    expect(store().request).toBeNull()
  })

  it('does not let a lapsing timer retire the request that replaced it', async () => {
    store().registerTarget('a', target('pane:chart'))
    store().registerTarget('b', target('pane:orderbook'))

    store().highlight('pane:chart', { durationMs: 30 })
    store().highlight('pane:orderbook', { durationMs: 400 })

    await Bun.sleep(80)
    expect(isLit('pane:orderbook')).toBe(true)
  })
})

describe('pending requests', () => {
  it('lands on a target that only mounts after the navigation', () => {
    // The whole reason requests are stored and pulled rather than
    // dispatched: `navigate_to` lights the shell before the page it is
    // opening has rendered anything.
    requestPendingSpotlight('shell')
    expect(isLit('shell')).toBe(true)

    store().registerTarget('a', target('shell'))
    expect(isLit('shell')).toBe(true)
  })

  it('lapses rather than waiting forever for a target that never arrives', async () => {
    requestPendingSpotlight('pane:never-mounts', 30)
    await Bun.sleep(80)
    expect(store().request).toBeNull()
  })
})

describe('duration', () => {
  it('is long enough to notice and short enough to not become decoration', () => {
    // The CSS keyframes are handed this exact number, so the overlay
    // unmounts on the frame its fade-out ends. A change here without a
    // matching look at assistant-spotlight.css desyncs the two.
    expect(SPOTLIGHT_DURATION_MS).toBe(6000)
  })
})
