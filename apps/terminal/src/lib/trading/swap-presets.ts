// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Execution presets for DEX swaps: slippage, priority fee, validator tip and
 * the MEV lane, saved as three named profiles the trader switches between.
 *
 * Three, not one, because the right settings are a property of the moment
 * and not of the trader: the same person buys a token an hour old with 20%
 * slippage and a tip, and rebalances a blue chip at 1% on the public lane.
 * Every trenches terminal converged on the same three-slot control for that
 * reason, and a trader arriving from one of them expects it.
 *
 * React-free on purpose. The ticket, the launchpad quick buy and the phone
 * all read the same profiles, and the tests read the same contract.
 */
import type {
  SwapExecution,
  SwapMevProtection,
  SwapPriorityLevel,
} from '@pairlens/market-engine/types'
import type { InstrumentClass } from '@pairlens/shared/market-ref'

export type SwapPreset = {
  /** User-given name, or null for the slot's default label. */
  name: string | null
  slippageBps: number
  /** Null means the venue's own estimate. */
  priorityLevel: SwapPriorityLevel | null
  /** Cap on the priority fee, in SOL. */
  maxPriorityFeeSol: number
  /** Validator tip in SOL, paid only on a private lane. */
  tipSol: number
  mev: SwapMevProtection
}

export type SwapPresets = readonly [SwapPreset, SwapPreset, SwapPreset]

export const SWAP_PRESETS_KEY = 'trade:swapPresets'
export const SWAP_PRESET_ACTIVE_KEY = 'trade:swapPresetActive'

export const SWAP_PRESET_COUNT = 3

/** i18n keys for the three default slot names. */
export const SWAP_PRESET_NAME_KEYS = [
  'terminal.trade.presetNormal',
  'terminal.trade.presetFast',
  'terminal.trade.presetUltra',
] as const

/**
 * Slippage the ticket offers as chips, in basis points. A memecoin on its
 * curve moves several percent between quote and fill; the old 0.1 to 3% row
 * failed most of those swaps, which is why it starts at 1% and reaches 30%.
 */
export const SWAP_SLIPPAGE_CHIPS_BPS: ReadonlyArray<number> = [
  100, 500, 1000, 2000, 3000,
]

/** Highest slippage a preset may carry. Above this the min-out floor is gone. */
export const MAX_SLIPPAGE_BPS = 5000
export const MIN_SLIPPAGE_BPS = 1

const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * Normal is the public lane at a slippage that fills a fresh pool; Fast pays
 * a tip on the private lane; Ultra is the private lane only, with the widest
 * slippage and the biggest tip, for the first minute of a launch.
 */
export const DEFAULT_SWAP_PRESETS: SwapPresets = [
  {
    name: null,
    slippageBps: 1000,
    priorityLevel: null,
    maxPriorityFeeSol: 0.005,
    tipSol: 0.001,
    mev: 'off',
  },
  {
    name: null,
    slippageBps: 2000,
    priorityLevel: 'high',
    maxPriorityFeeSol: 0.005,
    tipSol: 0.001,
    mev: 'reduced',
  },
  {
    name: null,
    slippageBps: 3000,
    priorityLevel: 'veryHigh',
    maxPriorityFeeSol: 0.02,
    tipSol: 0.005,
    mev: 'secure',
  },
]

const MEV_LANES: ReadonlySet<string> = new Set(['off', 'reduced', 'secure'])
const PRIORITY_LEVELS: ReadonlySet<string> = new Set([
  'medium',
  'high',
  'veryHigh',
])

export function clampSlippageBps(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SWAP_PRESETS[0].slippageBps
  return Math.min(
    MAX_SLIPPAGE_BPS,
    Math.max(MIN_SLIPPAGE_BPS, Math.round(value)),
  )
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

/** One slot, with every field checked against a default for that slot. */
export function normalizeSwapPreset(raw: unknown, slot: number): SwapPreset {
  const base = DEFAULT_SWAP_PRESETS[Math.min(2, Math.max(0, slot))]
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const name =
    typeof r['name'] === 'string' && r['name'].trim().length > 0
      ? r['name'].trim().slice(0, 24)
      : null
  const priorityLevel =
    typeof r['priorityLevel'] === 'string' &&
    PRIORITY_LEVELS.has(r['priorityLevel'])
      ? (r['priorityLevel'] as SwapPriorityLevel)
      : r['priorityLevel'] === null
        ? null
        : base.priorityLevel
  const mev =
    typeof r['mev'] === 'string' && MEV_LANES.has(r['mev'])
      ? (r['mev'] as SwapMevProtection)
      : base.mev
  return {
    name,
    slippageBps:
      typeof r['slippageBps'] === 'number'
        ? clampSlippageBps(r['slippageBps'])
        : base.slippageBps,
    priorityLevel,
    maxPriorityFeeSol: finiteNonNegative(
      r['maxPriorityFeeSol'],
      base.maxPriorityFeeSol,
    ),
    tipSol: finiteNonNegative(r['tipSol'], base.tipSol),
    mev,
  }
}

/**
 * A stored value, whatever shape it has, to exactly three sane presets. A
 * corrupt blob degrades slot by slot to the defaults rather than to nothing,
 * so a bad write never leaves the ticket without a slippage.
 */
export function normalizeSwapPresets(raw: unknown): SwapPresets {
  const list = Array.isArray(raw) ? raw : []
  return [
    normalizeSwapPreset(list[0], 0),
    normalizeSwapPreset(list[1], 1),
    normalizeSwapPreset(list[2], 2),
  ]
}

export function clampPresetIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  return value >= 0 && value < SWAP_PRESET_COUNT ? value : null
}

/**
 * The slot a ticket starts on when the trader has not picked one. A memecoin
 * desk starts on Fast: the token is minutes old and the public lane at 10%
 * is the setting that fails. Everything else starts on Normal.
 */
export function defaultPresetIndexFor(
  cls: InstrumentClass | undefined,
): number {
  return cls === 'memecoin' ? 1 : 0
}

/** The order-level execution options a preset resolves to. */
export function swapExecutionOf(preset: SwapPreset): SwapExecution {
  const out: SwapExecution = { mev: preset.mev }
  if (preset.priorityLevel) {
    out.priorityLevel = preset.priorityLevel
    out.maxPriorityFeeLamports = Math.round(
      preset.maxPriorityFeeSol * LAMPORTS_PER_SOL,
    )
  }
  if (preset.mev !== 'off') {
    out.tipLamports = Math.round(preset.tipSol * LAMPORTS_PER_SOL)
  }
  return out
}

/** `1000` → `10%`, `50` → `0.5%`. */
export function formatSlippage(bps: number): string {
  const pct = bps / 100
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`
}
