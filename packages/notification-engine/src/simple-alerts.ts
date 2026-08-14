// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Simple Alerts ────────────────────────────────────────────────────
//
// The two alerts almost everybody wants — "tell me when it crosses this
// price" and "tell me when it moves this much this fast" — expressed as
// ordinary notification rules.
//
// There is no second storage format and no `kind` field on the rule. A
// simple alert IS a rule whose graph happens to match a canonical shape:
// one event step, no conditions, channels wired straight off the event.
// `readSimpleAlert` recognises that shape and hands back the parameters;
// anything else reads as a custom flow. That is what lets the same rule be
// edited in the two-field form, opened in the graph builder, and evaluated
// by one runtime — and what makes "convert to a custom flow" a one-way door
// the user walks through rather than a migration the app performs.

import type {
  NotificationEdgeDSL,
  NotificationRuleDSL,
  NotificationStepDSL,
} from './types'

// ── Percent-move windows ─────────────────────────────────────────────

/** Windows offered for a "moved X% in Y" alert. */
export const PERCENT_WINDOWS = ['5m', '15m', '1h', '4h', '24h'] as const

export type PercentWindow = (typeof PERCENT_WINDOWS)[number]

export const PERCENT_WINDOW_MS: Record<PercentWindow, number> = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
}

/**
 * Candle timeframe a window is measured on.
 *
 * A rolling window needs enough bars to look back across it and few enough
 * that the buffer covers it: every pairing here lands between 12 and 24
 * bars, well inside the subscription manager's 200-bar buffer, and each
 * base bar is short enough that the move is noticed within a fraction of
 * the window rather than at the end of it.
 */
export const PERCENT_WINDOW_BASE_TIMEFRAME: Record<PercentWindow, string> = {
  '5m': '1m',
  '15m': '1m',
  '1h': '5m',
  '4h': '15m',
  '24h': '1h',
}

export function isPercentWindow(value: unknown): value is PercentWindow {
  return (
    typeof value === 'string' &&
    (PERCENT_WINDOWS as ReadonlyArray<string>).includes(value)
  )
}

// ── Spec ─────────────────────────────────────────────────────────────

/**
 * Channels a simple alert can reach. Webhooks are deliberately absent —
 * they need a URL and a host grant, which is exactly the kind of setup the
 * simple path exists to avoid. Adding one in the builder turns the rule
 * into a custom flow, which is the correct outcome.
 */
export type SimpleAlertChannels = {
  toast: boolean
  os: boolean
  telegram: boolean
}

export type SimpleAlertSpec =
  | {
      kind: 'price-level'
      direction: 'above' | 'below'
      price: number
      channels: SimpleAlertChannels
    }
  | {
      kind: 'percent-move'
      direction: 'up' | 'down' | 'either'
      percent: number
      window: PercentWindow
      channels: SimpleAlertChannels
    }

export type SimpleAlertKind = SimpleAlertSpec['kind']

export const SIMPLE_ALERT_CHANNEL_TYPES = {
  toast: 'local-toast',
  os: 'os-notification',
  telegram: 'telegram',
} as const

const CHANNEL_TYPE_TO_KEY: Record<string, keyof SimpleAlertChannels> = {
  'local-toast': 'toast',
  'os-notification': 'os',
  telegram: 'telegram',
}

export const DEFAULT_SIMPLE_ALERT_CHANNELS: SimpleAlertChannels = {
  toast: true,
  os: true,
  telegram: false,
}

// ── Cooldowns ────────────────────────────────────────────────────────

/**
 * A level alert keeps matching for as long as the price sits past the
 * level, so it needs a floor between firings even though the evaluator
 * only fires on the crossing itself (a price oscillating around the level
 * crosses it repeatedly).
 */
export const PRICE_LEVEL_COOLDOWN_SECONDS = 300

/**
 * A move alert gets one firing per window: a 5% hour that keeps being a 5%
 * hour for the next forty minutes is one piece of news, not forty.
 */
export function percentMoveCooldownSeconds(window: PercentWindow): number {
  return Math.round(PERCENT_WINDOW_MS[window] / 1000)
}

export function simpleAlertCooldownSeconds(spec: SimpleAlertSpec): number {
  return spec.kind === 'price-level'
    ? PRICE_LEVEL_COOLDOWN_SECONDS
    : percentMoveCooldownSeconds(spec.window)
}

// ── Build ────────────────────────────────────────────────────────────

/** Layout for the graph view — a row of channels beside the event. */
const EVENT_POSITION = { x: 0, y: 120 }
const CHANNEL_X = 340
const CHANNEL_Y_STEP = 150

function newId(): string {
  return crypto.randomUUID()
}

function eventStepFor(spec: SimpleAlertSpec): NotificationStepDSL {
  if (spec.kind === 'price-level') {
    return {
      id: newId(),
      type: 'price-alert',
      position: { ...EVENT_POSITION },
      data: { direction: spec.direction, price: spec.price },
    }
  }
  return {
    id: newId(),
    type: 'percent-move',
    position: { ...EVENT_POSITION },
    data: {
      direction: spec.direction,
      percent: spec.percent,
      window: spec.window,
    },
  }
}

function channelStepsFor(
  channels: SimpleAlertChannels,
): Array<NotificationStepDSL> {
  const steps: Array<NotificationStepDSL> = []
  const push = (type: string, data: Record<string, unknown>) => {
    steps.push({
      id: newId(),
      type,
      position: { x: CHANNEL_X, y: steps.length * CHANNEL_Y_STEP },
      data,
    })
  }
  if (channels.toast) push('local-toast', {})
  if (channels.os) push('os-notification', { sound: true })
  if (channels.telegram) push('telegram', { chatId: '', silent: false })
  return steps
}

/**
 * The graph a simple alert expands to. Kept separate from rule creation so
 * the store can rebuild a rule's steps in place when the user edits the
 * form, and so tests can hand the result straight to `validateRule`.
 */
export function buildSimpleAlertGraph(spec: SimpleAlertSpec): {
  steps: Array<NotificationStepDSL>
  edges: Array<NotificationEdgeDSL>
} {
  const event = eventStepFor(spec)
  const channels = channelStepsFor(spec.channels)
  return {
    steps: [event, ...channels],
    edges: channels.map((channel) => ({
      id: newId(),
      source: event.id,
      target: channel.id,
    })),
  }
}

/**
 * A name that reads the same in every language.
 *
 * Rule names are persisted, so translating one would freeze it into
 * whatever locale was active at creation time; they also reach the OS
 * notification and the activity log. Notation sidesteps both problems —
 * `BTC-USDT ≥ 100,000`, `ETH-USDT ±5% / 1h`. The UI renders its own
 * localized summary from the spec and only falls back to this.
 */
export function simpleAlertName(spec: SimpleAlertSpec, pair: string): string {
  if (spec.kind === 'price-level') {
    const level = Number(spec.price.toPrecision(8)).toLocaleString('en-US', {
      maximumFractionDigits: 8,
    })
    return `${pair} ${spec.direction === 'above' ? '≥' : '≤'} ${level}`
  }
  const sign =
    spec.direction === 'up' ? '+' : spec.direction === 'down' ? '-' : '±'
  return `${pair} ${sign}${spec.percent}% / ${spec.window}`
}

// ── Read back ────────────────────────────────────────────────────────

/**
 * Recognise the canonical shape and read the parameters back out.
 *
 * Strict on purpose. Every deviation — a condition step, a webhook, a
 * second event, an edge that skips the event — means the user has built
 * something the two-field form cannot express, and rendering that rule in
 * the form would quietly discard the parts it doesn't understand the next
 * time they pressed Save.
 */
export function readSimpleAlert(
  rule: NotificationRuleDSL,
): SimpleAlertSpec | null {
  const events = rule.steps.filter(
    (s) => s.type === 'price-alert' || s.type === 'percent-move',
  )
  if (events.length !== 1) return null
  const event = events[0]

  const channels = rule.steps.filter((s) => s.id !== event.id)
  if (channels.length === 0) return null
  if (channels.some((s) => !(s.type in CHANNEL_TYPE_TO_KEY))) return null

  // Every edge must run from the event to one of those channels, and every
  // channel must be reachable — an orphaned channel node never delivers.
  const reached = new Set<string>()
  for (const edge of rule.edges) {
    if (edge.source !== event.id) return null
    if (edge.sourceHandle && edge.sourceHandle !== 'out') return null
    reached.add(edge.target)
  }
  if (channels.some((s) => !reached.has(s.id))) return null

  const selected: SimpleAlertChannels = {
    toast: false,
    os: false,
    telegram: false,
  }
  for (const channel of channels) {
    selected[CHANNEL_TYPE_TO_KEY[channel.type]] = true
  }

  if (event.type === 'price-alert') {
    const price = Number(event.data.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) return null
    return {
      kind: 'price-level',
      direction: event.data.direction === 'below' ? 'below' : 'above',
      price,
      channels: selected,
    }
  }

  const percent = Number(event.data.percent ?? 0)
  if (!Number.isFinite(percent) || percent <= 0) return null
  const window = event.data.window
  if (!isPercentWindow(window)) return null
  const direction = event.data.direction
  return {
    kind: 'percent-move',
    direction:
      direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'either',
    percent,
    window,
    channels: selected,
  }
}

export function isSimpleAlert(rule: NotificationRuleDSL): boolean {
  return readSimpleAlert(rule) !== null
}
