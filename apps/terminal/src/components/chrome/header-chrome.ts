// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The top bar's vocabulary: chips, ticks, and nothing else.
 *
 * The board below the bar draws no borders at all, so a row of outlined
 * buttons above it reads as a different product bolted on top. Every control
 * up here is the same thing instead: a soft `--card` fill with a 10px radius
 * and no border, which is the same surface a workspace column is painted
 * with. Two surfaces on the whole screen, and the bar belongs to them.
 *
 * The separators are 18px ticks rather than full-height rules. A rule that
 * spans the bar cuts it into boxes; a tick just marks where one group of
 * controls ends, which is all the bar ever needed.
 */

/** The bar itself: 44px, 12px inset, 7px between items. */
export const HEADER_BAR =
  'flex h-11 shrink-0 items-center gap-[7px] border-b border-(--pane-rule) px-3'

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

/** Where one group of controls ends. Never a full-height rule. */
export const HEADER_TICK = 'mx-0.5 h-[18px] w-px shrink-0 bg-(--pane-rule)'
