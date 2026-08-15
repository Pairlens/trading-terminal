// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one way to link at a chart.
 *
 * Spread into a `<Link>` or handed to `navigate`, so every call site produces
 * the same typed three-segment target and none of them hand-builds a path:
 *
 *   <Link {...chartLinkProps(ref)}>…</Link>
 *   void navigate(chartLinkProps(ref))
 */
import type { MarketRef } from '@pairlens/shared/market-ref'

export function chartLinkProps(ref: MarketRef) {
  return {
    to: '/$cls/$market/$id' as const,
    params: { cls: ref.cls, market: ref.market, id: ref.id },
  }
}
