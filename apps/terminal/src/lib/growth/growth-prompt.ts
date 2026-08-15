// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The growth prompt engine: which support action to ask for, and whether now
 * is a decent moment to ask at all.
 *
 * Pairlens is source-available with no ad budget; the honest growth channel
 * is engaged users vouching for it — a GitHub star today, review sites later.
 * The whole design bets on one principle: ask rarely, ask only people the
 * product has already won, and take every "no" as final. A prompt that fires
 * at the wrong person converts nobody and costs trust with everybody.
 *
 * Three layers of restraint, all local and testable:
 *
 * 1. ELIGIBILITY — per action, over the engagement tally (engagement.ts).
 *    The habit gate is non-negotiable: active on at least 2 distinct days.
 *    On top of that, any ONE depth signal qualifies — each maps to a persona:
 *    explored 5+ pairs (the explorer), 3+ executed orders (the trader), 2+
 *    layout customizations (the customizer — people who arrange the furniture
 *    have moved in), 2+ things built (alerts/workflows/indicators — the
 *    builder), or 5+ copilot messages (the AI-native user).
 * 2. PACING — never within the first minutes of a session, at most one
 *    growth prompt of ANY kind per 14 days, and a long snooze on "later".
 * 3. FINALITY — 3 lifetime asks per action, then silence; an explicit "don't
 *    ask again" or a completed action is permanent silence.
 *
 * State is device-local and never synced: like the analytics consent flag,
 * "have I been asked" belongs to the machine it happened on.
 */

import type { EngagementStats } from '@/lib/growth/engagement'
import { readEngagement } from '@/lib/growth/engagement'

// ── Registry ────────────────────────────────────────────────────────

export type GrowthActionId = 'github-star'

export type GrowthAction = {
  id: GrowthActionId
  /** Where the CTA sends the user. */
  url: string
  /** Whether this user has earned the ask. */
  isEligible: (stats: EngagementStats) => boolean
}

/**
 * Ordered by priority — the first eligible, non-silenced action wins. Future
 * actions (review sites and friends) append here plus a copy block in the
 * dialog; everything else — pacing, storage, analytics — is shared.
 */
export const GROWTH_ACTIONS: ReadonlyArray<GrowthAction> = [
  {
    id: 'github-star',
    url: 'https://github.com/Pairlens/trading-terminal',
    isEligible: (stats) =>
      stats.days.length >= 2 &&
      (stats.pairs.length >= 5 ||
        stats.trades >= 3 ||
        stats.edits >= 2 ||
        stats.builds >= 2 ||
        stats.copilot >= 5),
  },
]

// ── Pacing constants ────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
/** Let them get to work first — a prompt must never greet anyone at boot. */
export const SESSION_SETTLE_MS = 4 * 60 * 1000
/** One growth prompt of any kind per this window. */
export const GLOBAL_SPACING_MS = 14 * DAY_MS
/** "Maybe later" means later — three weeks later. */
export const SNOOZE_MS = 21 * DAY_MS
/** Lifetime asks per action; after this, the answer was no. */
export const MAX_ASKS = 3

// ── Prompt state ────────────────────────────────────────────────────

const STORAGE_KEY = 'pairlens:growth-prompts'

export type GrowthActionStatus = 'idle' | 'snoozed' | 'done' | 'opted-out'

type ActionState = {
  status: GrowthActionStatus
  asks: number
  lastAskAt: number | null
}

type PromptState = {
  v: 1
  lastPromptAt: number | null
  actions: Partial<Record<GrowthActionId, ActionState>>
}

const EMPTY_STATE: PromptState = { v: 1, lastPromptAt: null, actions: {} }

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readPromptState(): PromptState {
  if (!hasStorage()) return { ...EMPTY_STATE, actions: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PromptState
      if (parsed && parsed.v === 1) return parsed
    }
  } catch {
    // Corrupt state resets to "never asked" — the pacing caps still apply
    // from here on, so the worst case is one extra ask.
  }
  return { ...EMPTY_STATE, actions: {} }
}

function writePromptState(state: PromptState): void {
  if (!hasStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Unwritable storage: the in-session guard still prevents repeats now;
    // next session starts fresh, which the settle delay keeps polite.
  }
}

function actionState(state: PromptState, id: GrowthActionId): ActionState {
  return state.actions[id] ?? { status: 'idle', asks: 0, lastAskAt: null }
}

/**
 * The action to prompt for right now, or null. `sessionStartedAt` is when
 * this app session began; `now` is injectable for tests.
 */
export function pickGrowthAction(
  sessionStartedAt: number,
  now: number = Date.now(),
): GrowthAction | null {
  if (now - sessionStartedAt < SESSION_SETTLE_MS) return null

  const state = readPromptState()
  if (
    state.lastPromptAt !== null &&
    now - state.lastPromptAt < GLOBAL_SPACING_MS
  )
    return null

  const stats = readEngagement()
  for (const action of GROWTH_ACTIONS) {
    const s = actionState(state, action.id)
    if (s.status === 'done' || s.status === 'opted-out') continue
    if (s.asks >= MAX_ASKS) continue
    if (
      s.status === 'snoozed' &&
      s.lastAskAt !== null &&
      now - s.lastAskAt < SNOOZE_MS
    )
      continue
    if (action.isEligible(stats)) return action
  }
  return null
}

/** The dialog is on screen — spend one ask and start the global spacing. */
export function markPromptShown(
  id: GrowthActionId,
  now: number = Date.now(),
): void {
  const state = readPromptState()
  const s = actionState(state, id)
  state.actions[id] = { ...s, asks: s.asks + 1, lastAskAt: now }
  state.lastPromptAt = now
  writePromptState(state)
}

/** The CTA was clicked. Taken on faith — we never verify the star. */
export function markPromptDone(id: GrowthActionId): void {
  const state = readPromptState()
  state.actions[id] = { ...actionState(state, id), status: 'done' }
  writePromptState(state)
}

/** "Maybe later", or the dialog dismissed without an answer. */
export function markPromptSnoozed(id: GrowthActionId): void {
  const state = readPromptState()
  const s = actionState(state, id)
  if (s.status === 'done' || s.status === 'opted-out') return
  state.actions[id] = { ...s, status: 'snoozed' }
  writePromptState(state)
}

/** "Don't ask again" — permanent for this action on this device. */
export function markPromptOptedOut(id: GrowthActionId): void {
  const state = readPromptState()
  state.actions[id] = { ...actionState(state, id), status: 'opted-out' }
  writePromptState(state)
}

/** Number of times this action has been asked — carried on analytics. */
export function promptAskCount(id: GrowthActionId): number {
  return actionState(readPromptState(), id).asks
}
