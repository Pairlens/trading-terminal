// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Rotation, read off the same snapshot the movers table uses.
 *
 * A sector is a curated list of base symbols (the instrument catalog's
 * categories) joined against the top-coins snapshot on symbol. Two properties
 * of that join decide whether the tape is honest:
 *
 * - **Only members with a quote count.** A category listing twelve assets of
 *   which the snapshot prices seven is a seven-asset sector here, and the chip
 *   says seven. Counting the absent five at zero would pull every sector
 *   toward flat, and the quiet ones hardest.
 * - **Capitalisation-weighted, not averaged.** A sector's move is what holding
 *   it would have done. An unweighted mean lets the smallest member in the
 *   list swing the chip, which is exactly the case where the tape is read and
 *   acted on.
 *
 * The chip's trend line is deliberately coarse: four points reconstructed from
 * the 7d, 24h and 1h changes the snapshot carries, normalised so the last
 * point is 1. It is a shape, not a chart, and it cannot say anything the three
 * percentages do not already say.
 */
import type {
  InstrumentCategory,
  TopCoin,
} from '@pairlens/shared/instrument-types'

/** Ship order of the tape: the sectors the catalog curates, as it lists them. */
export const SECTOR_ORDER: ReadonlyArray<InstrumentCategory> = [
  'layer1',
  'defi',
  'ai',
  'meme',
  'gaming',
  'infrastructure',
]

export type SectorWindow = '24h' | '7d'

export type SectorMover = { symbol: string; changePct: number }

export type SectorSummary = {
  category: InstrumentCategory
  /** Members the snapshot actually priced. */
  members: number
  /** Capitalisation-weighted move over the active window, in percent. */
  changePct: number
  advancing: number
  declining: number
  /** Strongest member over the window; null when the sector has no members. */
  leader: SectorMover | null
  /** Weakest member over the window. */
  laggard: SectorMover | null
  /**
   * The sector moved, but its members did not agree: advancing and declining
   * are within a hair of each other. Naming one of them "leads" would be a
   * coin flip, so the caption says "split tape" instead.
   */
  split: boolean
  /** Four points, oldest first, normalised so the last is 1. */
  trajectory: Array<number>
}

/**
 * How close to even a sector has to be before its caption stops naming a
 * leader. One name in six is the widest gap that still reads as "the sector
 * did not agree" rather than as a direction: 3 up against 3 down is split, and
 * so is 7 against 5, but 8 against 4 is a tape with a side.
 */
const SPLIT_TOLERANCE = 1 / 6

/**
 * Did the members disagree? Only a sector with something on both sides can be
 * split — six advancing and nothing declining is unanimous, not even.
 */
export function isSplitTape(advancing: number, declining: number): boolean {
  const moved = advancing + declining
  if (moved === 0 || advancing === 0 || declining === 0) return false
  return Math.abs(advancing - declining) / moved <= SPLIT_TOLERANCE
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

const isPositive = (v: unknown): v is number => isFiniteNumber(v) && v > 0

const pctOr0 = (v: unknown): number => (isFiniteNumber(v) ? v : 0)

/** A point on the trend line: where 1 today sat, `pct` percent ago. */
function backTo(pct: number): number {
  const factor = 1 + pct / 100
  // A −100% window would put the past at zero and the line at infinity. Both
  // are bad rows rather than market history, so the point flattens instead.
  return factor > 0.01 ? 1 / factor : 1
}

function weightedChange(
  members: ReadonlyArray<TopCoin>,
  pick: (coin: TopCoin) => number,
): number {
  let weight = 0
  let weighted = 0
  for (const coin of members) {
    const cap = isPositive(coin.marketCap) ? coin.marketCap : 0
    if (cap === 0) continue
    weight += cap
    weighted += cap * pick(coin)
  }
  if (weight > 0) return weighted / weight
  // Nothing carries a capitalisation: fall back to a plain mean rather than
  // reporting flat, which would read as "this sector did not move".
  if (members.length === 0) return 0
  let sum = 0
  for (const coin of members) sum += pick(coin)
  return sum / members.length
}

/**
 * One summary per sector that has at least one priced member, ordered by the
 * window's move, strongest first.
 *
 * `membersOf` is the catalog's membership (category → base symbols);
 * `coinsBySymbol` is the snapshot. Sectors the snapshot cannot price at all
 * are dropped rather than rendered as an empty chip.
 */
export function summarizeSectors(
  membersOf: ReadonlyMap<InstrumentCategory, ReadonlyArray<string>>,
  coinsBySymbol: ReadonlyMap<string, TopCoin>,
  window: SectorWindow,
): Array<SectorSummary> {
  const pick = (coin: TopCoin): number =>
    window === '7d'
      ? pctOr0(coin.percentChange7d)
      : pctOr0(coin.percentChange24h)

  const summaries: Array<SectorSummary> = []

  for (const category of SECTOR_ORDER) {
    const symbols = membersOf.get(category) ?? []
    const members: Array<TopCoin> = []
    for (const symbol of symbols) {
      const coin = coinsBySymbol.get(symbol.toUpperCase())
      if (coin && isPositive(coin.price)) members.push(coin)
    }
    if (members.length === 0) continue

    let advancing = 0
    let declining = 0
    let leader: SectorMover | null = null
    let laggard: SectorMover | null = null
    for (const coin of members) {
      const change = pick(coin)
      if (change > 0) advancing++
      else if (change < 0) declining++
      const symbol = coin.symbol.toUpperCase()
      if (!leader || change > leader.changePct)
        leader = { symbol, changePct: change }
      if (!laggard || change < laggard.changePct)
        laggard = { symbol, changePct: change }
    }

    const change7d = weightedChange(members, (c) => pctOr0(c.percentChange7d))
    const change24h = weightedChange(members, (c) => pctOr0(c.percentChange24h))
    const change1h = weightedChange(members, (c) => pctOr0(c.percentChange1h))

    summaries.push({
      category,
      members: members.length,
      changePct: window === '7d' ? change7d : change24h,
      advancing,
      declining,
      leader,
      laggard,
      split: isSplitTape(advancing, declining),
      trajectory: [backTo(change7d), backTo(change24h), backTo(change1h), 1],
    })
  }

  summaries.sort(
    (a, b) => b.changePct - a.changePct || a.category.localeCompare(b.category),
  )
  return summaries
}
