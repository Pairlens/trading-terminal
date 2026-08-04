// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning a `BotOrderIntent` into a fill.
 *
 * Two very different jobs behind one function, on purpose:
 *
 * **Paper never touches the venue.** It could — most connectors have a paper
 * mode — but then paper P&L would be produced by the exchange's simulator and
 * backtest P&L by ours, and the two would disagree in ways nobody could
 * explain. A user comparing "what the tester promised" against "what the bot
 * did" is comparing the strategy, not two fill models, so paper fills are
 * simulated right here with the *strategy's own* fee and slippage and the same
 * arithmetic as `runBacktest`. Paper also needs no credentials and cannot be
 * rejected, region-blocked, or rate-limited, which is what makes it a safe
 * default.
 *
 * **Live goes through the app's guarded order path**, which enforces the
 * user's risk config and can throw as readily as it can return a failure.
 */
import { getBotOrderSource } from './bot-order-source'
import type { BotMode, BotOrderIntent } from '@pairlens/bot-engine/types'
import type { CustomIndicatorStrategySpec } from '@pairlens/shared/plugin-types'

/** Venue-facing side as a signed multiplier: +1 buy, -1 sell. */
export const sideSign = (side: 'buy' | 'sell'): number =>
  side === 'buy' ? 1 : -1

/** What a simulated fill cost. */
export type PaperFill = {
  /** Slippage-adjusted price the order is assumed to have filled at. */
  price: number
  /** Fee paid on this leg, quote currency. */
  fee: number
}

/**
 * The paper fill model, matching `runBacktest` exactly:
 *
 * - slippage moves the price *against* the order (`raw * (1 + slippage*side)`),
 *   so a buy pays up and a sell gets less;
 * - the fee is a fraction of the filled notional, charged per side.
 *
 * A flip is one order in both places — both legs trade the same way round, so
 * the single adjusted price serves the whole transition and the fee is charged
 * on the combined quantity, which is the sum of the backtester's two legs.
 */
export function simulatePaperFill(
  referencePrice: number,
  side: 'buy' | 'sell',
  quantity: number,
  spec: Pick<CustomIndicatorStrategySpec, 'fee' | 'slippage'>,
): PaperFill {
  const raw = Number.isFinite(referencePrice) ? referencePrice : 0
  const slippage = Math.max(spec.slippage, 0)
  const fee = Math.max(spec.fee, 0)
  const price = raw * (1 + slippage * sideSign(side))
  return { price, fee: Math.max(quantity, 0) * price * fee }
}

/**
 * Net P&L of one round trip, fees included on both legs — the same expression
 * the backtester books when a position closes.
 */
export function realizedPnl(input: {
  direction: 1 | -1
  entryPrice: number
  exitPrice: number
  quantity: number
  entryFee: number
  exitFee: number
}): number {
  const gross =
    input.direction * (input.exitPrice - input.entryPrice) * input.quantity
  return gross - input.entryFee - input.exitFee
}

export type BotExecuteRequest = {
  botId: string
  mode: BotMode
  market: string
  pair: string
  intent: BotOrderIntent
  /** Base-currency size to submit. For a flip: close size + open size. */
  quantity: number
  /**
   * Price the fill is measured against — the open of the bar *after* the one
   * that produced the signal. Decisions are made on closed bars, so this is
   * the first price that existed once the signal did.
   */
  referencePrice: number
  spec: Pick<CustomIndicatorStrategySpec, 'fee' | 'slippage'>
  /** Required for live; ignored for paper. */
  credentialId?: string
}

export type BotExecuteResult =
  | {
      ok: true
      /** Assumed fill price (exact for paper, reference price for live). */
      price: number
      quantity: number
      /** Quote currency. Estimated from the strategy's fee rate in live mode. */
      fee: number
      ts: number
      orderId?: string
    }
  | {
      ok: false
      error: string
      /**
       * The original throw, when there was one. The runtime branches on its
       * TYPE — a sealed vault parks the bot, everything else halts it — and a
       * message string cannot carry that distinction reliably.
       */
      cause?: unknown
    }

/**
 * Global serialization chain for LIVE orders.
 *
 * `pluginManager.setContext()` is mutable global state, set immediately before
 * `execute()` inside the order path. Two bots on different venues placing
 * orders concurrently would interleave those two statements and one of them
 * would be routed to the other's connector — a real order, on the wrong
 * exchange. Making live submissions strictly sequential across the whole
 * process is the only thing that closes that window, and it costs nothing:
 * orders happen on bar closes, not per tick.
 *
 * Paper deliberately does NOT queue here. It touches no shared state, and
 * making it wait behind a slow venue round-trip would let a simulation drift
 * away from the bar that produced it.
 */
let liveChain: Promise<unknown> = Promise.resolve()

function serializeLive<T>(task: () => Promise<T>): Promise<T> {
  const run = liveChain.then(task)
  // Keep the chain alive after a failure; the caller still sees the rejection.
  liveChain = run.catch(() => undefined)
  return run
}

/** Execute one intent. Never throws — failures come back as `ok: false`. */
export async function executeBotOrder(
  request: BotExecuteRequest,
): Promise<BotExecuteResult> {
  const { intent, quantity, referencePrice, spec, mode } = request

  if (!(quantity > 0)) {
    return { ok: false, error: 'Order size resolved to zero' }
  }
  if (!(referencePrice > 0)) {
    return { ok: false, error: 'No price available to fill against' }
  }

  if (mode === 'paper') {
    const fill = simulatePaperFill(referencePrice, intent.side, quantity, spec)
    return {
      ok: true,
      price: fill.price,
      quantity,
      fee: fill.fee,
      ts: Date.now(),
    }
  }

  const source = getBotOrderSource()
  if (!source) {
    return { ok: false, error: 'Order routing is unavailable' }
  }
  if (!request.credentialId) {
    return { ok: false, error: 'No credential for this venue' }
  }

  return serializeLive(async () => {
    try {
      const result = await source.placeOrder({
        market: request.market,
        pair: request.pair,
        side: intent.side,
        type: 'market',
        size: String(quantity),
        mode: 'live',
        credentialId: request.credentialId,
      })
      if (!result?.success) {
        return {
          ok: false as const,
          error: result?.error ?? 'Order rejected by venue',
        }
      }
      // A market order's true average price only arrives with the venue's fill
      // report, which the runtime does not subscribe to. The reference price
      // is the honest approximation available at submission time; the run log
      // says "live" so nobody reads these marks as exchange truth.
      return {
        ok: true as const,
        price: referencePrice,
        quantity,
        fee: quantity * referencePrice * Math.max(spec.fee, 0),
        ts: Date.now(),
        ...(result.orderId ? { orderId: result.orderId } : {}),
      }
    } catch (err) {
      // The guarded path throws for risk-guard locks — a legitimate refusal,
      // not a bug, and one the user has to see rather than have retried.
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
        cause: err,
      }
    }
  })
}
