// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Average-cost position ledger ──
//
// Spot exchanges do not report realized PnL (a futures concept), so to enforce
// a daily-loss limit we derive it ourselves from order fills using the
// average-cost method. The ledger is SESSION-SCOPED: it starts empty and only
// realizes PnL for round-trips it actually observed. A sell against a position
// with no known cost basis (e.g. coins bought before this session) realizes
// nothing rather than fabricating profit against a zero cost basis.

export type OrderSide = 'buy' | 'sell'

type Position = { qty: number; avgCost: number }

export class PositionLedger {
  private positions = new Map<string, Position>()
  // Cumulative filled qty already accounted per order, so repeated order
  // updates (which carry CUMULATIVE fill size) only count the new increment.
  private seenFill = new Map<string, number>()

  /**
   * Account for an order update carrying a cumulative fill size.
   * Returns the realized PnL from the newly-filled increment:
   *   - buys always return 0 (they build cost basis, not PnL)
   *   - sells return (fillPrice - avgCost) * soldQty for the known position
   *   - sells beyond / without a known basis return 0
   * Fees are not subtracted — this is a guardrail estimate, not accounting.
   */
  applyFill(
    orderId: string,
    pair: string,
    side: OrderSide,
    cumulativeFillSize: number,
    avgPrice: number,
  ): number {
    if (!(cumulativeFillSize > 0) || !(avgPrice > 0)) return 0

    const prevFill = this.seenFill.get(orderId) ?? 0
    const increment = cumulativeFillSize - prevFill
    if (increment <= 0) return 0 // no new fill, or an out-of-order update
    this.seenFill.set(orderId, cumulativeFillSize)

    const pos = this.positions.get(pair) ?? { qty: 0, avgCost: 0 }

    if (side === 'buy') {
      const newQty = pos.qty + increment
      pos.avgCost =
        newQty > 0 ? (pos.qty * pos.avgCost + increment * avgPrice) / newQty : 0
      pos.qty = newQty
      this.positions.set(pair, pos)
      return 0
    }

    // sell — realize PnL only against quantity we have a cost basis for
    if (pos.qty <= 0) return 0
    const soldQty = Math.min(increment, pos.qty)
    const realized = (avgPrice - pos.avgCost) * soldQty
    pos.qty -= soldQty
    if (pos.qty <= 1e-12) {
      pos.qty = 0
      pos.avgCost = 0
    }
    this.positions.set(pair, pos)
    return realized
  }

  /** Current tracked position for a pair (for inspection/tests). */
  position(pair: string): Readonly<Position> {
    return this.positions.get(pair) ?? { qty: 0, avgCost: 0 }
  }

  /** Forget all positions and fill history (e.g. on sign-out). */
  reset(): void {
    this.positions.clear()
    this.seenFill.clear()
  }
}
