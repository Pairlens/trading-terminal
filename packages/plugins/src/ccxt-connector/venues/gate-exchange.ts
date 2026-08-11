// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Gate's one ccxt-side hazard, and it is a quiet one.
 *
 * `gate.fetchTickers()` hard-codes `timezone: 'utc0'` on the `/spot/tickers`
 * request, which changes what `change_percentage` MEANS: with that flag Gate
 * reports the change since UTC midnight, not the rolling 24 h. Measured on the
 * same pair in the same second:
 *
 *   (no timezone)      change_percentage = "-1.6"
 *   ?timezone=utc0     change_percentage = "0.03"
 *   ?timezone=all      change_percentage = "-1.6"  (+ change_utc0, change_utc8)
 *
 * `fetchTicker` (singular) sends no timezone, so the bulk snapshot and the live
 * ticker would disagree by whatever the day is doing — the markets scanner would
 * show a Gate row at +0.03 % next to a chart header at -1.59 %. The native
 * connector calls `/spot/tickers` bare and gets the rolling figure, and parity
 * item 29 ("`change24h` is a percent, whatever the venue's native unit") is
 * about the unit; this is about the WINDOW, which no test guards.
 *
 * `timezone: 'all'` is the fix rather than dropping the param: it restores
 * `change_percentage` to the rolling 24 h and merely adds two extra fields that
 * nothing reads. Passing `undefined` would leave ccxt to serialize the key.
 *
 * The override is a class FIELD holding an arrow function rather than a method:
 * `CcxtExchangeLike` models ccxt's surface as properties, and TypeScript refuses
 * to let a method override a base member typed as a property.
 */

import type { CcxtExchangeCtor, CcxtExchangeLike } from '../types'

type GateBaseCtor = new (config: Record<string, unknown>) => CcxtExchangeLike

export function withGateQuirks(Base: CcxtExchangeCtor): CcxtExchangeCtor {
  class GateBridge extends (Base as GateBaseCtor) {
    override fetchTickers = async (
      symbols?: Array<string>,
      params: Record<string, unknown> = {},
    ): ReturnType<CcxtExchangeLike['fetchTickers']> => {
      return await super.fetchTickers(symbols, { timezone: 'all', ...params })
    }
  }

  return GateBridge as unknown as CcxtExchangeCtor
}
