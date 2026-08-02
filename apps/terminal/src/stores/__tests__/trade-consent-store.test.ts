// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'
import {
  markProposalExecuted,
  useTradeConsentStore,
  wasProposalExecuted,
} from '../trade-consent-store'

// Minimal localStorage backing. The store reads it defensively at import time
// (falls back to defaults when absent), so installing after imports is safe.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

beforeEach(() => {
  localStorage.clear()
  useTradeConsentStore.setState({ paper: false, liveMarkets: [] })
})

describe('trade consent scopes', () => {
  it('defaults to no standing consent', () => {
    const s = useTradeConsentStore.getState()
    expect(s.isAutoApproved('paper', 'okx')).toBe(false)
    expect(s.isAutoApproved('live', 'okx')).toBe(false)
  })

  it('paper consent is global, live consent is per market', () => {
    useTradeConsentStore.getState().setPaperAutoApprove(true)
    let s = useTradeConsentStore.getState()
    expect(s.isAutoApproved('paper', 'okx')).toBe(true)
    expect(s.isAutoApproved('paper', 'binance')).toBe(true)
    expect(s.isAutoApproved('live', 'okx')).toBe(false)

    useTradeConsentStore.getState().setLiveAutoApprove('OKX', true)
    s = useTradeConsentStore.getState()
    expect(s.isAutoApproved('live', 'okx')).toBe(true)
    expect(s.isAutoApproved('live', 'OKX')).toBe(true)
    expect(s.isAutoApproved('live', 'binance')).toBe(false)
  })

  it('consent is revocable and persisted', () => {
    const s = useTradeConsentStore.getState()
    s.setPaperAutoApprove(true)
    s.setLiveAutoApprove('okx', true)
    expect(
      JSON.parse(localStorage.getItem('pairlens:copilot:trade-consent') ?? ''),
    ).toEqual({ paper: true, liveMarkets: ['okx'] })

    useTradeConsentStore.getState().setLiveAutoApprove('okx', false)
    useTradeConsentStore.getState().setPaperAutoApprove(false)
    const after = useTradeConsentStore.getState()
    expect(after.isAutoApproved('paper', 'okx')).toBe(false)
    expect(after.isAutoApproved('live', 'okx')).toBe(false)
    expect(
      JSON.parse(localStorage.getItem('pairlens:copilot:trade-consent') ?? ''),
    ).toEqual({ paper: false, liveMarkets: [] })
  })

  it('deduplicates repeated live grants', () => {
    const s = useTradeConsentStore.getState()
    s.setLiveAutoApprove('okx', true)
    useTradeConsentStore.getState().setLiveAutoApprove('okx', true)
    expect(useTradeConsentStore.getState().liveMarkets).toEqual(['okx'])
  })
})

describe('executed-proposal replay guard', () => {
  it('marks proposals as executed exactly once', () => {
    expect(wasProposalExecuted('p1')).toBe(false)
    markProposalExecuted('p1')
    expect(wasProposalExecuted('p1')).toBe(true)
    expect(wasProposalExecuted('p2')).toBe(false)
  })

  it('caps the ledger without losing recent entries', () => {
    for (let i = 0; i < 250; i++) markProposalExecuted(`p${i}`)
    expect(wasProposalExecuted('p249')).toBe(true)
    expect(wasProposalExecuted('p0')).toBe(false) // evicted by the ring cap
  })
})
