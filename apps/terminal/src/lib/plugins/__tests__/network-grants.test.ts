// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { ungrantedHosts } from '../network-grants'

// The tricky part of the desktop grant flow: deciding which of a plugin's
// declared hosts still need user consent (aren't already covered by the baseline
// CSP or an existing grant). Wildcard vs exact coverage has non-obvious edges.
describe('ungrantedHosts', () => {
  it('flags a concrete host with no matching allow entry', () => {
    expect(ungrantedHosts(['api.acme-store.com'], [])).toEqual([
      'api.acme-store.com',
    ])
  })

  it('treats a concrete host as covered by a matching wildcard', () => {
    expect(ungrantedHosts(['api.acme.com'], ['*.acme.com'])).toEqual([])
  })

  it('treats a concrete host as covered by an exact allow entry', () => {
    expect(ungrantedHosts(['api.acme.com'], ['api.acme.com'])).toEqual([])
  })

  it('treats a wildcard as covered by an equal wildcard', () => {
    expect(ungrantedHosts(['*.acme.com'], ['*.acme.com'])).toEqual([])
  })

  it('does NOT treat a wildcard as covered by only an exact host', () => {
    // A `*.acme.com` request is broader than an `acme.com` grant — still needs consent.
    expect(ungrantedHosts(['*.acme.com'], ['acme.com'])).toEqual(['*.acme.com'])
  })

  it('covers first-party hosts already in the baseline', () => {
    expect(
      ungrantedHosts(
        ['*.pairlens.finance', 'api.acme.com'],
        ['*.pairlens.finance', 'pairlens.finance'],
      ),
    ).toEqual(['api.acme.com'])
  })

  it('returns every declared host when nothing is allowed', () => {
    expect(ungrantedHosts(['a.example.com', 'b.example.com'], [])).toEqual([
      'a.example.com',
      'b.example.com',
    ])
  })

  it('is empty for a plugin that declares no hosts', () => {
    expect(ungrantedHosts([], ['*.acme.com'])).toEqual([])
  })
})
