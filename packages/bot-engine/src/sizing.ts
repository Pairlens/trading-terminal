// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How much to buy or sell, in base currency.
 *
 * Sizing is where a bot quietly dies: the venue rejects a dust order, the
 * strategy fires again next bar, and the user watches a bot that "does
 * nothing" without ever being told why. So this never throws and never returns
 * a bare 0 — a refusal carries the reason that goes straight into the event
 * log.
 *
 * Fees are NOT deducted here. The executor owns fee and slippage modelling
 * (paper) or the venue does (live), and a fee subtracted in both places would
 * be charged twice. A caller that wants headroom for the taker fee passes
 * already-reduced equity; sizing at a literal 100% of the balance will be
 * rejected by most venues once the fee is added on top.
 */
import type { BotSizing } from './types'

/** Venue lot rules. Every field is optional: unknown means unconstrained. */
export type VenueConstraints = {
  /** Smallest order value the venue accepts, in quote currency. */
  minNotional?: number
  /** Base-currency increment orders must be a multiple of. */
  stepSize?: number
  /** Smallest order size the venue accepts, in base currency. */
  minQuantity?: number
}

/**
 * A size, or a refusal with the reason already written for a human. The `0`
 * literal on the refusal keeps a caller that only reads `quantity` safe: it
 * places nothing either way.
 */
export type SizingResult =
  | { quantity: number }
  | { quantity: 0; reason: string }

function refuse(reason: string): SizingResult {
  return { quantity: 0, reason }
}

function positive(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

/**
 * Decimal places implied by a step, so `0.1 + 0.2`-class noise never reaches
 * the venue as `0.30000000000000004`. Steps arrive from venue metadata and can
 * be exponential (`1e-8`), which `toString` preserves.
 */
function stepDecimals(step: number): number {
  const text = step.toString()
  const exponent = text.indexOf('e-')
  if (exponent !== -1) {
    const mantissa = text.slice(0, exponent)
    const dot = mantissa.indexOf('.')
    const mantissaDecimals = dot === -1 ? 0 : mantissa.length - dot - 1
    return Number(text.slice(exponent + 2)) + mantissaDecimals
  }
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * Round DOWN to the venue's lot step. Always down: rounding up would commit
 * more capital than the user's sizing rule asked for, and the whole point of
 * the rule is that the user chose the number.
 *
 * The epsilon absorbs binary-float error in the division only (0.3 / 0.1 is
 * 2.9999999999999996), so a quantity that is already an exact multiple does
 * not lose a step.
 */
function roundDownToStep(quantity: number, step: number): number {
  const steps = Math.floor(quantity / step + 1e-9)
  return Number((steps * step).toFixed(stepDecimals(step)))
}

/**
 * Resolve a `BotSizing` rule into a base-currency quantity.
 *
 * `equityQuote` is the tradable balance in quote currency at decision time,
 * which is what makes `percent-equity` compound: the same rule commits more
 * after a winning run and less after a losing one, without the caller tracking
 * anything.
 */
export function resolveQuantity(
  sizing: BotSizing,
  equityQuote: number,
  price: number,
  constraints: VenueConstraints = {},
): SizingResult {
  if (!Number.isFinite(price) || price <= 0) {
    return refuse(`no usable price (got ${price})`)
  }
  if (!Number.isFinite(equityQuote) || equityQuote <= 0) {
    return refuse(`no tradable balance (equity ${equityQuote})`)
  }
  if (!Number.isFinite(sizing.value) || sizing.value <= 0) {
    return refuse(`sizing value must be positive (got ${sizing.value})`)
  }

  let quantity: number
  switch (sizing.kind) {
    case 'percent-equity': {
      // Above 1 the rule is asking for leverage, which spot deployments do not
      // have. Refusing beats silently clamping: the user's intent is wrong and
      // they need to see that, not a position half the size they configured.
      if (sizing.value > 1) {
        return refuse(
          `percent-equity must be within (0, 1], got ${sizing.value}`,
        )
      }
      quantity = (equityQuote * sizing.value) / price
      break
    }
    case 'fixed-quote': {
      if (sizing.value > equityQuote) {
        return refuse(
          `fixed-quote size ${sizing.value} exceeds available ${equityQuote}`,
        )
      }
      quantity = sizing.value / price
      break
    }
    case 'fixed-base': {
      // A base-currency rule still has to be paid for in quote, and the price
      // it is paid at moves. Checking here turns an insufficient-balance
      // rejection from the venue into a line the user can read.
      const notional = sizing.value * price
      if (notional > equityQuote) {
        return refuse(
          `fixed-base size ${sizing.value} needs ${notional} quote, available ${equityQuote}`,
        )
      }
      quantity = sizing.value
      break
    }
  }

  const step = positive(constraints.stepSize)
  if (step !== null) quantity = roundDownToStep(quantity, step)

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return refuse(
      step !== null
        ? `size rounds to zero at step ${step}`
        : 'size resolves to zero',
    )
  }

  // Both venue minimums are checked AFTER rounding, because rounding down is
  // what pushes a borderline order under them.
  const minQuantity = positive(constraints.minQuantity)
  if (minQuantity !== null && quantity < minQuantity) {
    return refuse(`size ${quantity} below venue minimum ${minQuantity}`)
  }

  const minNotional = positive(constraints.minNotional)
  if (minNotional !== null && quantity * price < minNotional) {
    return refuse(
      `notional ${quantity * price} below venue minimum ${minNotional}`,
    )
  }

  return { quantity }
}
