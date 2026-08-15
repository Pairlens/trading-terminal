// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * React access to the one resolver. Everything a component needs to turn "I am
 * watching BTC" into "chart it on OKX" lives behind `useMarketRefResolver`.
 */
import { useCallback, useMemo } from 'react'

import { resolveMarketRef } from './resolve'
import type { MarketRefContext, MarketRefResolution } from './resolve'
import type { InstrumentRef, MarketRef } from '@pairlens/shared/market-ref'

import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { usePersistedState } from '@/hooks/use-persisted-state'

export type ResolverOptions = {
  /**
   * The venue to prefer, when the caller already holds a fresher one than
   * `terminal.market`. The mobile shell must pass `focusedVenue`: reading the
   * persisted key through a second `usePersistedState` instance learns about a
   * write one microtask late, and resolving off that stale value snapped every
   * manual venue pick back to the previous one.
   */
  preferred?: string
}

export function useMarketRefContext(
  options?: ResolverOptions,
): MarketRefContext & { ready: boolean } {
  const { markets, defaultMarket } = useAvailableMarkets()
  const [persistedPreferred] = usePersistedState(
    'terminal.market',
    defaultMarket,
  )
  const preferred = options?.preferred ?? persistedPreferred

  return useMemo(
    () => ({ markets, preferred, ready: markets.length > 0 }),
    [markets, preferred],
  )
}

/**
 * `(instrument, listedOn?) => resolution`. `listedOn` is the venue list the
 * instruments index reported for this row, when the caller happens to have it;
 * omitting it just means the index had nothing to say, which is the standalone
 * and signed-out case for everything.
 */
export function useMarketRefResolver(
  options?: ResolverOptions,
): (
  inst: InstrumentRef,
  listedOn?: ReadonlyArray<string>,
) => MarketRefResolution {
  const ctx = useMarketRefContext(options)
  return useCallback(
    (inst, listedOn) => resolveMarketRef(inst, { ...ctx, listedOn }),
    [ctx],
  )
}

/**
 * `(instrument, preferredVenue?) => ref | null`, where the venue is chosen per
 * call rather than per mount. For callers acting on someone else's request:
 * the copilot's `switch_pair` may name a venue, and if it names one that
 * cannot serve the instrument the resolver substitutes rather than obeying.
 */
export function useMarketRefWithPreferred(): (
  inst: InstrumentRef,
  preferred?: string,
) => MarketRef | null {
  const ctx = useMarketRefContext()
  return useCallback(
    (inst, preferred) => {
      const result = resolveMarketRef(
        inst,
        preferred ? { ...ctx, preferred } : ctx,
      )
      return result.ok ? result.ref : null
    },
    [ctx],
  )
}

/** The same thing for the many callers that just want a ref or nothing. */
export function useMarketRefOrNull(
  options?: ResolverOptions,
): (inst: InstrumentRef, listedOn?: ReadonlyArray<string>) => MarketRef | null {
  const resolve = useMarketRefResolver(options)
  return useCallback(
    (inst, listedOn) => {
      const result = resolve(inst, listedOn)
      return result.ok ? result.ref : null
    },
    [resolve],
  )
}
