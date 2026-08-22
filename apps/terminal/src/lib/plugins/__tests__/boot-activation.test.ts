// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Boot activates in two passes and `pluginsReady` sits between them, so this
 * predicate decides whether a pane's first read finds its provider or finds
 * nothing. It shipped wrong once, and the failure was invisible in the way
 * that matters: the memecoin board's chart painted while its three panes
 * reported the feed had not answered.
 */
import { describe, expect, it } from 'bun:test'

import { BOOTSTRAP_PLUGINS } from '../bootstrap-bundle'
import { activatesBeforeReady } from '../boot-activation'

function manifestOf(id: string) {
  const found = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === id)
  if (!found) throw new Error(`${id} is not in the bootstrap bundle`)
  return found.manifest
}

describe('activatesBeforeReady', () => {
  it('takes every provider a pane reads on mount', () => {
    for (const id of [
      'okx-market-connector',
      'jupiter-dex-connector',
      // The regression: a launchpad column and all three trade panes fire
      // their first read the instant `pluginsReady` flips.
      'memecoin-data-provider',
      'geckoterminal-data-provider',
      'dexscreener-data-provider',
    ]) {
      expect(activatesBeforeReady(manifestOf(id)), id).toBe(true)
    }
  })

  it('leaves the second pass to plugins nothing waits on', () => {
    // AI providers are reached from a chat the user has to open, themes are
    // applied by a subscriber rather than read, and the pane families declare
    // no capability at all.
    for (const id of ['groq-inference', 'pairlens-memecoins']) {
      expect(activatesBeforeReady(manifestOf(id)), id).toBe(false)
    }
  })

  it('does not claim the wildcard discovery provider', () => {
    // `pairlens-core` serves `market-data:discovery` on ['*'] and is activated
    // by name before any of this. Matching the wildcard here would make the
    // rule read as if it were doing that work.
    expect(activatesBeforeReady(manifestOf('pairlens-core'))).toBe(false)
  })
})
