// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The top bar's vocabulary: chips, space, and nothing else.
 *
 * The board below the bar draws no borders at all, so a row of outlined
 * buttons above it reads as a different product bolted on top. Every control
 * up here is the same thing instead: a soft `--card` fill with a 10px radius
 * and no border, which is the same surface a workspace column is painted
 * with. Two surfaces on the whole screen, and the bar belongs to them.
 *
 * Grouping is done with space. Controls that belong together sit 7px apart
 * and groups sit 20px apart, which is far enough that the eye reads the gap
 * as a break without a rule having to draw one. There is no separator in this
 * file on purpose: a bar this dense turns into a row of boxes the moment you
 * start ruling it, and the whole point of the redesign was to stop doing
 * that. The bar carries no bottom rule either. What separates it from the
 * board is the 10px of ground above the first column, and the column's own
 * card edge under that.
 */

/** The bar: 44px, 12px inset, one group-sized gap between its children. */
export const HEADER_BAR =
  'flex h-11 shrink-0 items-center gap-5 overflow-hidden px-3'

/** Controls that belong together. Every direct child of the bar is one. */
export const HEADER_GROUP = 'flex min-w-0 shrink items-center gap-[7px]'

/** A control on the bar. */
export const HEADER_CHIP =
  'inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-[5px] rounded-[10px] border-0 bg-card px-[9px] text-xs font-normal whitespace-nowrap text-foreground shadow-none transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden data-[popup-open]:bg-muted'

/** The same chip, for a control that names something secondary. */
export const HEADER_CHIP_MUTED = `${HEADER_CHIP} text-muted-foreground hover:text-foreground`

/**
 * The one tinted chip. The workspace is the piece of state the whole board
 * hangs off, so it is the only control up here that carries the accent.
 */
export const HEADER_CHIP_PRIMARY =
  'inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border-0 bg-primary/15 px-[9px] text-xs font-normal whitespace-nowrap text-primary shadow-none transition-colors hover:bg-primary/25 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden data-[popup-open]:bg-primary/25'

/** A bare icon control: no fill until you reach for it. */
export const HEADER_ICON =
  'inline-flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent p-0 text-muted-foreground shadow-none transition-colors hover:bg-card hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden'

/**
 * A page's name on the bar.
 *
 * 13px/600, the same size and weight the pair chip's symbol wears on a trade
 * page and the same the Discovery bar already used, so whatever surface you
 * are on is named at one type size across the whole product.
 *
 * The pages used to prefix this with their section icon. The rail's current
 * chip carries that same glyph, on the same baseline, thirty pixels to the
 * left; the second copy said nothing the first had not.
 */
export const HEADER_TITLE =
  'shrink-0 text-[13px] font-semibold tracking-[-0.01em]'
