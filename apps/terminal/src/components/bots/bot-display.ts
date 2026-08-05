// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Presentation helpers shared by the bot card, the detail panel and the
 * create flow.
 *
 * Kept apart from the components so the status vocabulary has exactly one
 * definition: a bot that reads "halted" on the card must read "halted" in the
 * ledger, and a dot colour that means "stopped" in one place cannot quietly
 * mean "idle" in another.
 */
import type { BotMode, BotStatus } from '@pairlens/bot-engine/types'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type { PreviewParams } from '@/components/indicators/preview-params'
import { defaultPreviewParams } from '@/components/indicators/preview-params'

/** i18n key for a status, under the flat `botsPage` namespace. */
export function statusLabelKey(status: BotStatus): string {
  switch (status) {
    case 'running':
      return 'botsPage.statusRunning'
    case 'warming-up':
      return 'botsPage.statusWarmingUp'
    case 'error':
      return 'botsPage.statusError'
    case 'halted':
      return 'botsPage.statusHalted'
    case 'waiting-unlock':
      return 'botsPage.statusWaitingUnlock'
    case 'stopped':
    default:
      return 'botsPage.statusStopped'
  }
}

/**
 * How a list row reads at a glance.
 *
 * The row itself carries the state now, so there is no status dot to squint
 * at — but that only works if the whole state space maps onto the fill.
 * "Green when running" alone would leave halted and errored bots looking
 * exactly like ones the user turned off, which is the one confusion this
 * feature cannot afford.
 */
export type BotRowTone = 'active' | 'attention' | 'error' | 'idle'

export function rowTone(
  status: BotStatus,
  needsRearm: boolean,
  scriptMissing = false,
): BotRowTone {
  // A bot with no strategy left cannot run at all, whatever its last run said.
  // That outranks every other reading of the row: it is broken, not idle.
  if (scriptMissing) return 'error'
  // A bot waiting to be re-armed is stopped, but stopped *pending a decision* —
  // it must not blend in with the ones deliberately switched off.
  if (needsRearm) return 'attention'
  switch (status) {
    case 'running':
    case 'warming-up':
      return 'active'
    // `waiting-unlock` is armed and waiting, not switched off — it reads as
    // attention for the same reason `needsRearm` does: the user has a
    // decision to make.
    case 'halted':
    case 'waiting-unlock':
      return 'attention'
    case 'error':
      return 'error'
    case 'stopped':
    default:
      return 'idle'
  }
}

/** Resting fill per tone. */
export const TONE_FILL: Record<BotRowTone, string> = {
  active: 'bg-up/10 text-foreground hover:bg-up/15',
  attention: 'bg-amber-500/10 text-foreground hover:bg-amber-500/15',
  error: 'bg-destructive/10 text-foreground hover:bg-destructive/15',
  idle: 'text-muted-foreground hover:bg-muted hover:text-foreground',
}

/** Selected fill per tone — a ring, so selection never overwrites state. */
export const TONE_SELECTED: Record<BotRowTone, string> = {
  active: 'bg-up/20 ring-1 ring-inset ring-up/40',
  attention: 'bg-amber-500/20 ring-1 ring-inset ring-amber-500/40',
  error: 'bg-destructive/20 ring-1 ring-inset ring-destructive/40',
  idle: 'bg-accent text-accent-foreground',
}

/**
 * Dot fill for a status. Only `running` gets the up-token green — a bot that
 * needs attention must never share a colour with a bot that is fine.
 */
export function statusDotClass(status: BotStatus): string {
  switch (status) {
    case 'running':
      return 'bg-up'
    case 'warming-up':
      return 'bg-primary animate-pulse'
    case 'error':
      return 'bg-destructive'
    case 'halted':
    case 'waiting-unlock':
      return 'bg-amber-500'
    case 'stopped':
    default:
      return 'bg-muted-foreground/40'
  }
}

/**
 * Turning a bot on or off, wherever the control happens to live.
 *
 * Shared rather than duplicated because it encodes a safety rule, not a
 * convenience: turning a bot OFF is always immediate, but turning a live one
 * ON is the moment real orders resume and must go through the arming dialog.
 * A second copy of this in a list row is a second chance to get it wrong.
 *
 * `needsRearm` counts as live for this purpose — it is set precisely because a
 * live bot came back from a restart without the user having said so yet.
 *
 * A bot whose script has been deleted can only ever be turned OFF. The runtime
 * would halt it a moment after starting anyway, and the round trip through
 * "on, then error, then off by itself" is what makes a deleted strategy read
 * as a broken app rather than a missing file.
 */
export function requestBotToggle(
  bot: {
    id: string
    mode: BotMode
    needsRearm?: boolean
    /** The strategy behind `scriptId` is gone — see `isScriptMissing`. */
    scriptMissing?: boolean
  },
  checked: boolean,
  handlers: {
    setEnabled: (id: string, enabled: boolean) => void
    requestArm: () => void
  },
): void {
  if (!checked) {
    handlers.setEnabled(bot.id, false)
    return
  }
  if (bot.scriptMissing) return
  if (bot.mode === 'live' || bot.needsRearm) {
    handlers.requestArm()
    return
  }
  handlers.setEnabled(bot.id, true)
}

/** P&L colour. Exactly zero stays neutral rather than claiming a direction. */
export function pnlClass(value: number): string {
  if (value > 0) return 'text-up'
  if (value < 0) return 'text-down'
  return 'text-muted-foreground'
}

/** Signed quote-currency amount, e.g. `+12.34` / `−0.87`. */
export function formatSignedPnl(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  const magnitude = Math.abs(value)
  const digits = magnitude >= 1000 ? 0 : magnitude >= 1 ? 2 : 4
  return `${sign}${magnitude.toFixed(digits)}`
}

/** Base-currency size. Small sizes need precision; big ones do not. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1000) return value.toFixed(2)
  if (value >= 1) return value.toFixed(4)
  return value.toPrecision(4)
}

/**
 * A bot's stored `params` reconciled against the script's current `inputs`:
 * keys the script still declares keep their value, keys it dropped fall away,
 * and keys it gained arrive at the declared default.
 *
 * Scripts get edited after a bot is deployed, so the stored params are only
 * ever a hint — the script's declaration is the authority on what exists.
 */
export function mergeBotParams(
  meta: CustomIndicatorMeta,
  stored: Record<string, unknown> | undefined,
): PreviewParams {
  const params = defaultPreviewParams(meta)
  if (!stored) return params
  for (const input of meta.inputs) {
    const value = stored[input.key]
    if (value !== undefined && typeof value === typeof input.default) {
      params[input.key] = value as number | boolean | string
    }
  }
  return params
}
