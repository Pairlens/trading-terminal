// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Which of the Markets pane's featured instruments the phone shows, and in
 * what order.
 *
 * The pool is the desktop's, unchanged — the same `featured` flag out of the
 * same discovery catalog. What differs is that the phone shows five of them
 * and the desktop shows all of them in a grid, so the choice of which five
 * matters here and does not there. Catalog rank alone put Apple, Microsoft and
 * NVIDIA in three of the five slots, and without an Alpaca key those price as
 * "—" with a flat trend line: three empty rows above Solana on a default
 * install, which is the report this answers.
 *
 * Anything with a price sorts first; inside each group the catalog's own order
 * is kept, so this never invents a ranking of its own. When every entry is
 * priced (a fully connected install) the result is exactly the catalog order.
 */

/** Stable, priced-first, capped. `isPriced` is the caller's quote lookup. */
export function orderFeatured<T>(
  pool: ReadonlyArray<T>,
  isPriced: (entry: T) => boolean,
  limit: number,
): Array<T> {
  return pool
    .map((entry, index) => ({ entry, index, priced: isPriced(entry) ? 0 : 1 }))
    .sort((a, b) =>
      a.priced !== b.priced ? a.priced - b.priced : a.index - b.index,
    )
    .slice(0, Math.max(0, limit))
    .map((item) => item.entry)
}
