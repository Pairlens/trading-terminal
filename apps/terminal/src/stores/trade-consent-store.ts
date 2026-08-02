// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Trade auto-approval consent — the copilot's "don't ask again" permissions.
//
// Every copilot order proposal renders a confirmation card. This store holds
// the user's standing consent to skip that confirmation, Claude-style:
//   • paper trades: one global opt-in (simulated funds)
//   • live trades:  per-market opt-in (real funds — deliberately narrower)
//
// Consent only short-circuits the card's confirm CLICK. The order still goes
// through the risk-guarded MarketDataProvider.placeOrder — guardrails are
// enforced regardless of consent, and consent is revocable from the card.
//
// The executed-proposal ledger guards against replay: chat history is
// persisted and re-rendered, so an auto-approving card must never re-execute
// a proposal it (or a previous session) already executed.
// ---------------------------------------------------------------------------

const CONSENT_KEY = 'pairlens:copilot:trade-consent'
const EXECUTED_KEY = 'pairlens:copilot:executed-proposals'
const EXECUTED_CAP = 200

/** How long a proposal stays auto-executable after the tool created it. */
export const PROPOSAL_FRESHNESS_MS = 3 * 60_000

export type TradeAutoApproval = {
  paper: boolean
  /** Market ids (lowercase) the user auto-approves LIVE orders on. */
  liveMarkets: Array<string>
}

type PersistedConsent = TradeAutoApproval

function loadConsent(): PersistedConsent {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return { paper: false, liveMarkets: [] }
    const parsed = JSON.parse(raw) as Partial<PersistedConsent>
    return {
      paper: parsed.paper === true,
      liveMarkets: Array.isArray(parsed.liveMarkets)
        ? parsed.liveMarkets.filter((m): m is string => typeof m === 'string')
        : [],
    }
  } catch {
    return { paper: false, liveMarkets: [] }
  }
}

function saveConsent(consent: PersistedConsent): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent))
  } catch {
    // Persistence is best-effort
  }
}

type TradeConsentStore = TradeAutoApproval & {
  setPaperAutoApprove: (enabled: boolean) => void
  setLiveAutoApprove: (market: string, enabled: boolean) => void
  /** Does standing consent cover this order? */
  isAutoApproved: (mode: 'paper' | 'live', market: string) => boolean
}

export const useTradeConsentStore = create<TradeConsentStore>((set, get) => ({
  ...loadConsent(),

  setPaperAutoApprove(enabled) {
    set({ paper: enabled })
    const s = get()
    saveConsent({ paper: s.paper, liveMarkets: s.liveMarkets })
  },

  setLiveAutoApprove(market, enabled) {
    const id = market.toLowerCase()
    const current = get().liveMarkets
    const next = enabled
      ? current.includes(id)
        ? current
        : [...current, id]
      : current.filter((m) => m !== id)
    set({ liveMarkets: next })
    const s = get()
    saveConsent({ paper: s.paper, liveMarkets: s.liveMarkets })
  },

  isAutoApproved(mode, market) {
    const s = get()
    return mode === 'paper'
      ? s.paper
      : s.liveMarkets.includes(market.toLowerCase())
  },
}))

// ---------------------------------------------------------------------------
// Executed-proposal replay guard (module-level, localStorage-backed ring)
// ---------------------------------------------------------------------------

function loadExecuted(): Array<string> {
  try {
    const raw = localStorage.getItem(EXECUTED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return []
  }
}

export function wasProposalExecuted(proposalId: string): boolean {
  return loadExecuted().includes(proposalId)
}

export function markProposalExecuted(proposalId: string): void {
  try {
    const next = [...loadExecuted().filter((id) => id !== proposalId)]
    next.push(proposalId)
    localStorage.setItem(
      EXECUTED_KEY,
      JSON.stringify(next.slice(-EXECUTED_CAP)),
    )
  } catch {
    // Best-effort — freshness window still bounds replays
  }
}
