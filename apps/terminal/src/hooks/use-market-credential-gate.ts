// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Can this venue stream anything at all right now?"
 *
 * Every other venue answers yes: crypto candles, books and tickers come off a
 * public feed and a missing API key costs you trading, not prices. Alpaca is
 * the exception in the bundled set — it has no public feed, so without a
 * provisioned credential the chart never seeds, the book stays empty and the
 * pane sits on `PaneTransition`'s "Switching to Alpaca…" badge forever. That
 * badge is a lie by omission: it says "wait" for a state that never resolves.
 *
 * The two blocked states are genuinely different and must not be merged:
 *
 *   'missing'  no credential for the venue. The fix is the connect wizard.
 *   'sealed'   a credential probably exists but the vault is closed, so the
 *              store cannot even enumerate it. The fix is one unlock.
 *
 * `sealed` deliberately does not check whether an Alpaca key is among the
 * sealed ones — it cannot. `credentials` is `[]` while sealed by design (see
 * the `CredentialsStatus` doc comment), and guessing "you have no Alpaca key"
 * from an empty list is the exact bug that type exists to prevent. Unlocking
 * is the right next step either way; if no key turns up afterwards the gate
 * simply moves to 'missing' and asks for one.
 */
import type { CredentialsStatus } from '@/stores/credentials-store'
import { useCredentialsStore } from '@/stores/credentials-store'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

/** 'ok' also covers "still loading" — a brief spinner is honest. */
export type CredentialGateState = 'ok' | 'sealed' | 'missing'

export type MarketCredentialGate = {
  state: CredentialGateState
  /** Display name of the venue, for copy that has to name it. */
  venueLabel: string
}

/**
 * The decision, with no React in it — this is what the tests exercise, since
 * the terminal ships no hook renderer and a rule nobody can run is a rule that
 * drifts.
 */
export function resolveCredentialGate({
  credentialedMarketData,
  status,
  hasCredential,
}: {
  credentialedMarketData: boolean
  status: CredentialsStatus
  hasCredential: boolean
}): CredentialGateState {
  if (!credentialedMarketData) return 'ok'
  if (status === 'sealed') return 'sealed'
  // 'idle' | 'loading' | 'error' all mean "we don't know yet", and claiming
  // "connect an account" over a keychain read still in flight would flash a
  // wrong CTA on every cold start.
  if (status !== 'ready') return 'ok'
  return hasCredential ? 'ok' : 'missing'
}

export function useMarketCredentialGate(market: string): MarketCredentialGate {
  const { markets } = useAvailableMarkets()
  const status = useCredentialsStore((s) => s.status)
  // Selecting the boolean, not the array: this runs in every market pane, and
  // a new array identity on every credentials write would re-render all of
  // them for a key that has nothing to do with the venue they are bound to.
  const hasCredential = useCredentialsStore((s) =>
    s.credentials.some((c) => c.market === market),
  )

  const venue = markets.find((m) => m.value === market)

  return {
    state: resolveCredentialGate({
      credentialedMarketData: venue?.credentialedMarketData ?? false,
      status,
      hasCredential,
    }),
    venueLabel: venue?.label ?? market,
  }
}
