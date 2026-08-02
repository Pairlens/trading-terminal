// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The transition step: what the bot holds versus what the strategy wants it to
 * hold, reduced to at most one order.
 *
 * This is deliberately the narrowest function in the package. The strategy has
 * already spoken (a target of 1, -1 or 0 from the last closed bar) and risk has
 * already had its say; all that is left is the difference between two states,
 * which is the one part of the money path that has to be trivially auditable.
 */
import type { BotDecisionInput, BotOrderIntent, BotSide } from './types'

/**
 * The position the strategy is asking for, after the deployment's own veto.
 *
 * `allowShort` is a property of the deployment, not the script: the same script
 * runs long-only on a venue without shorts. A short target that the deployment
 * refuses collapses to flat rather than to "hold what we have" — the strategy
 * has said it no longer wants to be long, and honouring half of that by staying
 * long would be worse than honouring none of it.
 *
 * A non-finite target means the script produced garbage this bar. That also
 * reads as flat: holding risk on the word of a computation we know is broken is
 * the one outcome nobody would have chosen deliberately.
 */
function resolveTarget(target: number, allowShort: boolean): BotSide | null {
  if (!Number.isFinite(target)) return null
  if (target > 0) return 'long'
  if (target < 0) return allowShort ? 'short' : null
  return null
}

/**
 * The single order that moves the bot from its held position to its target, or
 * null when it is already there.
 *
 * A reversal is ONE `flip` intent, never an `exit` followed by an `enter`. Two
 * orders can half-succeed, and a bot that closed its long but failed to open
 * its short is flat while its own state machine, its event log and its user all
 * believe it is short. One intent means one fill or one rejection.
 *
 * `side` is venue-facing, so it describes the order rather than the position:
 * both "close a long" and "flip long to short" submit a sell.
 */
export function decideTransition(
  input: BotDecisionInput,
): BotOrderIntent | null {
  const held = input.position ? input.position.side : null
  const target = resolveTarget(input.target, input.allowShort)

  if (held === target) return null

  if (held === null) {
    return {
      kind: 'enter',
      side: target === 'long' ? 'buy' : 'sell',
      targetSide: target,
      reason: 'signal-entry',
      barIndex: input.barIndex,
    }
  }

  if (target === null) {
    return {
      kind: 'exit',
      side: held === 'long' ? 'sell' : 'buy',
      targetSide: null,
      reason: 'signal-exit',
      barIndex: input.barIndex,
    }
  }

  return {
    kind: 'flip',
    side: target === 'long' ? 'buy' : 'sell',
    targetSide: target,
    reason: 'signal-flip',
    barIndex: input.barIndex,
  }
}
