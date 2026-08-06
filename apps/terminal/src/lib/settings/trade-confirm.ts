// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a user commits a trade: press & hold (the default) or a single click.
 *
 * Hold is the default on purpose. An order is irreversible the moment it
 * leaves the terminal, and the filling button gives the hand a beat to change
 * its mind — the same beat a confirmation dialog would buy, without the modal.
 * Traders who place many orders a session can spend that beat back in
 * Settings → Risk Management; nothing else on the order path changes, and the
 * risk guardrails are enforced identically under either gesture.
 *
 * React-free on purpose: the hooks, the settings UI and the tests all read the
 * same contract from here.
 */

export type TradeConfirmMode = 'hold' | 'click'

/** Persistence contract shared by `useTradeConfirmMode` and the settings UI. */
export const TRADE_CONFIRM_MODE_KEY = 'trade-confirm-mode'
export const TRADE_CONFIRM_MODE_DEFAULT: TradeConfirmMode = 'hold'

/**
 * Canonical option list (value + i18n label/description keys), so the radio in
 * settings and anything that documents the choice later render one wording.
 */
export const TRADE_CONFIRM_MODES: ReadonlyArray<{
  value: TradeConfirmMode
  labelKey: string
  descKey: string
}> = [
  {
    value: 'hold',
    labelKey: 'settings.risk.confirmHold',
    descKey: 'settings.risk.confirmHoldDescription',
  },
  {
    value: 'click',
    labelKey: 'settings.risk.confirmClick',
    descKey: 'settings.risk.confirmClickDescription',
  },
]

export function isTradeConfirmMode(value: unknown): value is TradeConfirmMode {
  return value === 'hold' || value === 'click'
}

/**
 * A stored value that isn't a known mode resolves to `hold`: the safer of the
 * two gestures is what a corrupted preference should fall back to.
 */
export function normalizeTradeConfirmMode(value: unknown): TradeConfirmMode {
  return isTradeConfirmMode(value) ? value : TRADE_CONFIRM_MODE_DEFAULT
}

/** Live funds hold longer than paper — the wait is the point. */
export const TRADE_HOLD_MS = { live: 720, paper: 480 } as const

export function tradeHoldMs(isLive: boolean): number {
  return isLive ? TRADE_HOLD_MS.live : TRADE_HOLD_MS.paper
}

/**
 * The gesture a confirm control should implement.
 *
 * `immediate` fires on the press itself; `hold` fills for `holdMs` first.
 * Reduced-motion readers never get the hold: the fill is the only thing that
 * says how long to keep pressing, and they have asked not to be shown it —
 * leaving them holding a button with no feedback is worse than a plain click.
 */
export function resolveConfirmGesture(
  mode: TradeConfirmMode,
  opts: { reducedMotion: boolean },
): 'hold' | 'immediate' {
  if (mode === 'click') return 'immediate'
  return opts.reducedMotion ? 'immediate' : 'hold'
}
