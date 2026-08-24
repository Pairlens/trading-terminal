// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Should the Equities desk explain itself before the trader works out that it
 * is broken?
 *
 * Discovery is five panes and no chart, and on the stocks section three of
 * them are gated behind a broker key: the session strip, movers, and anything
 * priced. A trader who has never connected Alpaca lands on a board where the
 * calendars are full, the prices are absent, and nothing on screen says the
 * two facts are related. Every crypto section fills in on its own, so the
 * honest reading of that board is "this product is half finished", not "this
 * venue wants a key".
 *
 * So the section says it once, in a dialog, and then never again. The panes
 * keep their own inline gates for every visit after: this is the introduction,
 * not the mechanism.
 *
 * Pure decision, no React and no storage — the host in
 * `components/equities/equities-connect-dialog.tsx` supplies the inputs.
 */
import type { CredentialGateState } from '@/hooks/use-market-credential-gate'
import type { DiscoverySectionId } from '@/lib/layout/workspaces/discovery-sections'

/** This device has already been told. Local: another screen is not this one. */
export const EQUITIES_CONNECT_PROMPT_KEY = 'equities.connectPromptSeen'

/**
 * The one section that needs it. Stocks is the only asset class whose venue
 * publishes no public feed, which is exactly the surprise being explained; a
 * crypto board that is still loading is a board that will finish loading.
 */
export const EQUITIES_CONNECT_PROMPT_SECTION: DiscoverySectionId = 'stocks'

export function shouldShowEquitiesConnectPrompt({
  section,
  gate,
  seen,
  onboardingDone,
  tourPending,
  tipsDisabled,
}: {
  section: DiscoverySectionId
  /**
   * Only 'missing' opens it. 'sealed' is a locked vault, which means the user
   * has already connected something and already knows what a key is for — and
   * the panes carry an unlock button that fixes it in one tap. Spending the
   * one-time explainer on a state the trader has seen before would burn it
   * for the one it was written for. 'ok' includes "still reading the
   * keychain", so nothing fires on a cold start.
   */
  gate: CredentialGateState
  seen: boolean
  onboardingDone: boolean
  /**
   * Discovery's own first-open tour is still owed. Two modals on one paint is
   * the reason the desktop nudge waits the tour out too.
   */
  tourPending: boolean
  /** The trader turned first-visit tips off. That answer counts here. */
  tipsDisabled: boolean
}): boolean {
  if (section !== EQUITIES_CONNECT_PROMPT_SECTION) return false
  if (gate !== 'missing') return false
  if (seen || tipsDisabled) return false
  if (!onboardingDone) return false
  return !tourPending
}
