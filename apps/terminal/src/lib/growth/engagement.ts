// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Local engagement counters behind the growth prompts (see growth-prompt.ts).
 *
 * The recorder taps the `track()` choke point in analytics-events.ts, so it
 * sees every declared product event without adding a single call site — but
 * it is NOT analytics: everything here stays in localStorage on this device,
 * accumulates with or without PostHog consent, and never leaves the machine.
 * What it answers is one question: "has this person actually adopted the
 * terminal?" — which is what earns the right to ask them for a favor.
 *
 * Counters are deliberately coarse. Distinct active days is the habit signal;
 * the rest are one-per-persona depth signals (explorer, trader, customizer,
 * builder, AI-native). No timestamps per event, no order history, no symbols
 * beyond the distinct-pair set — this is a tally, not a diary.
 */

const STORAGE_KEY = 'pairlens:growth-engagement'

/** Caps keep the two distinct-sets bounded; both are far past any gate. */
const MAX_DAYS = 30
const MAX_PAIRS = 50

export type EngagementStats = {
  v: 1
  /** Distinct local calendar days (YYYY-MM-DD) with any activity. */
  days: Array<string>
  /** Distinct `${venue}:${pair}` keys ever opened. */
  pairs: Array<string>
  /** Orders the venue accepted (paper and live both count — both are use). */
  trades: number
  /** Layout customizations: panes added, layouts saved, workspaces created. */
  edits: number
  /** Things built: alerts, workflows, indicators added or saved. */
  builds: number
  /** Copilot / assistant messages sent. */
  copilot: number
}

const EMPTY: EngagementStats = {
  v: 1,
  days: [],
  pairs: [],
  trades: 0,
  edits: 0,
  builds: 0,
  copilot: 0,
}

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readEngagement(): EngagementStats {
  if (!hasStorage()) return { ...EMPTY, days: [], pairs: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as EngagementStats
      if (parsed && parsed.v === 1) return parsed
    }
  } catch {
    // Corrupt or unreadable — start over; these are best-effort tallies.
  }
  return { ...EMPTY, days: [], pairs: [] }
}

function write(stats: EngagementStats): void {
  if (!hasStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    // Quota/private-mode failures just mean the tally pauses.
  }
}

/** Local calendar day — "two different days" means days the user lived. */
function today(): string {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Push onto a distinct set with a cap; returns true when it grew. */
function addDistinct(list: Array<string>, value: string, max: number): boolean {
  if (list.includes(value)) return false
  if (list.length >= max) return false
  list.push(value)
  return true
}

/**
 * Mark today as an active day even when no counted event fires — a session
 * spent watching one chart is still a session. Called once from the growth
 * prompt host on mount.
 */
export function recordActiveDay(): void {
  const stats = readEngagement()
  if (addDistinct(stats.days, today(), MAX_DAYS)) write(stats)
}

/** Events that bump the depth counters, by counter. */
const TRADE_EVENTS = new Set(['trade_executed'])
const EDIT_EVENTS = new Set([
  'workspace_layout_saved',
  'workspace_created',
  'panel_added',
  'preset_applied',
])
const BUILD_EVENTS = new Set([
  'alert_created',
  'workflow_saved',
  'indicator_added',
  'python_indicator_saved',
])
const COPILOT_EVENTS = new Set(['copilot_message_sent'])

/**
 * Called from `track()` for every declared product event, before consent is
 * checked. Must never throw into the caller — analytics keeps working even if
 * storage is broken.
 */
export function recordGrowthSignal(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    let touched = false
    const stats = readEngagement()

    if (event === 'pair_opened' && properties) {
      const venue = String(properties.venue ?? '')
      const pair = String(properties.pair ?? '')
      if (venue && pair) {
        touched = addDistinct(stats.pairs, `${venue}:${pair}`, MAX_PAIRS)
      }
    } else if (TRADE_EVENTS.has(event)) {
      stats.trades += 1
      touched = true
    } else if (EDIT_EVENTS.has(event)) {
      stats.edits += 1
      touched = true
    } else if (BUILD_EVENTS.has(event)) {
      stats.builds += 1
      touched = true
    } else if (COPILOT_EVENTS.has(event)) {
      stats.copilot += 1
      touched = true
    } else {
      return
    }

    // Any counted event marks the day active too.
    touched = addDistinct(stats.days, today(), MAX_DAYS) || touched
    if (touched) write(stats)
  } catch {
    // Growth accounting must never break the event that carried it.
  }
}
