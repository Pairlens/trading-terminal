// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  attachNavHistory,
  getCanGoBack,
  getCanGoForward,
  goBack,
  goForward,
  subscribeNavHistory,
} from '../nav-history'

import type { RouterHistory } from '@tanstack/react-router'

type HistoryAction = 'PUSH' | 'REPLACE' | 'BACK' | 'FORWARD' | 'GO'

/**
 * The slice of the router history the tracker touches: the current entry's
 * `__TSR_index`, `canGoBack()`, the two navigation calls and the subscription
 * the real browser history fires after each committed navigation.
 */
function fakeHistory() {
  let index = 0
  const subscribers = new Set<(args: { action: { type: string } }) => void>()

  const commit = (next: number, action: HistoryAction) => {
    index = next
    for (const subscriber of subscribers)
      subscriber({ action: { type: action } })
  }

  const history = {
    get location() {
      return { state: { __TSR_index: index } }
    },
    canGoBack: () => index !== 0,
    back: () => commit(index - 1, 'BACK'),
    forward: () => commit(index + 1, 'FORWARD'),
    subscribe: (cb: (args: { action: { type: string } }) => void) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
  }

  return {
    history: history as unknown as RouterHistory,
    push: () => commit(index + 1, 'PUSH'),
    replace: () => commit(index, 'REPLACE'),
    indexNow: () => index,
  }
}

// The tracker is a per-window singleton, so the whole lifecycle is one test:
// attaching twice is a deliberate no-op and there is no reset hook.
describe('nav-history — forward availability derived from the entry index', () => {
  it('tracks back/forward across pushes, pops and a truncating push', () => {
    const nav = fakeHistory()
    const seen: Array<string> = []
    subscribeNavHistory(() =>
      seen.push(
        `${getCanGoBack() ? 'b' : '-'}${getCanGoForward() ? 'f' : '-'}`,
      ),
    )

    attachNavHistory(nav.history)
    expect(getCanGoBack()).toBe(false)
    expect(getCanGoForward()).toBe(false)

    // Nowhere to go: both calls must be inert rather than throwing the webview
    // past the ends of its own stack.
    goBack()
    goForward()
    expect(nav.indexNow()).toBe(0)

    nav.push() // /pair/BTC-USDT
    expect(getCanGoBack()).toBe(true)
    expect(getCanGoForward()).toBe(false)

    nav.push() // /accounts
    goBack()
    expect(nav.indexNow()).toBe(1)
    expect(getCanGoBack()).toBe(true)
    expect(getCanGoForward()).toBe(true)

    goBack()
    expect(getCanGoBack()).toBe(false)
    expect(getCanGoForward()).toBe(true)

    goForward()
    expect(nav.indexNow()).toBe(1)
    expect(getCanGoBack()).toBe(true)
    expect(getCanGoForward()).toBe(true)

    // A replace swaps the current entry in place — the forward entries survive.
    nav.replace()
    expect(getCanGoForward()).toBe(true)

    // A push from a mid-stack entry discards everything ahead of it.
    nav.push()
    expect(getCanGoBack()).toBe(true)
    expect(getCanGoForward()).toBe(false)

    // Listeners only hear about real flips, not every navigation.
    expect(seen).toEqual(['b-', 'bf', '-f', 'bf', 'b-'])
  })

  it('ignores a second attach so the subscription is never doubled', () => {
    const other = fakeHistory()
    attachNavHistory(other.history)
    other.push()
    // Still bound to the first history: the second one can't move the state.
    expect(getCanGoForward()).toBe(false)
  })
})
