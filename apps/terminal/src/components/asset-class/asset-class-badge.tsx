// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "What kind of market is this?", answered in a pill.
 *
 * SPOT next to TAO-USDT, PERP next to BTC-USDT, DEX · Solana next to a pool,
 * STOCK · Pre-market next to NVDA, EVENT · Binary next to a Fed question. The
 * five classes settle differently and an order means a different thing on each
 * one, so the terminal says which is which rather than leaving it encoded in
 * the shape of a symbol.
 *
 * Presentational and data-free on purpose — it takes a class and an optional
 * detail and renders them, so it drops into a pane header, a table row or a
 * confirm card without dragging a hook along. The wrapper that KNOWS what a
 * given market's detail is lives next door in `market-asset-class-badge.tsx`.
 *
 * Colour comes from the one table in `lib/asset-class/visuals.ts`, shared with
 * the Discovery tabs and the markets scanner chips: same hue, same icon, same
 * label, so the association survives the jump between screens. The label is
 * always drawn, never the colour alone.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import type { InstrumentClass } from '@pairlens/shared/market-ref'

import { assetClassIcon } from '@/lib/asset-class/icons'
import { assetClassVisual } from '@/lib/asset-class/visuals'

const SIZES = {
  xs: 'h-[15px] gap-1 rounded px-1 text-[9px] tracking-[0.08em]',
  sm: 'h-5 gap-1 rounded-md px-1.5 text-[10px] tracking-[0.07em]',
} as const

/**
 * Where the words fit and where only the mark does.
 *
 * The terminal header is exactly full at 1280px: the pair symbol is the one
 * element on the row that shrinks, so 40px of badge is five characters of
 * ticker on a 13-inch laptop. Below the breakpoint the badge collapses to its
 * class icon in the class colour — a third of the width, still colour-coded,
 * still named by the tooltip and the accessible label. Identity wins the
 * pixels; the teaching keeps the hue.
 *
 * A CSS swap rather than a measured one: two class names cost nothing, and a
 * ResizeObserver in the header would re-render a bar that must not re-render.
 */
/* Written out in full, both of them: Tailwind reads source text, so a class
   name assembled from a template literal compiles to nothing. */
const COLLAPSED_ONLY = 'min-[1400px]:hidden'
const WIDE_ONLY = 'hidden min-[1400px]:inline'

export type AssetClassBadgeProps = {
  cls: InstrumentClass
  /**
   * The qualifier after the middot: a chain, a session phase, an event shape.
   * Already translated by the caller — this component knows classes, not
   * chains. Left off, the badge is just the class.
   */
  detail?: string
  size?: keyof typeof SIZES
  /**
   * Explain the class on hover. On by default because the teaching is the
   * point; turn it off in a dense list where every row would carry one.
   */
  tooltip?: boolean
  /**
   * Fall back to the class icon on narrow viewports instead of holding the
   * label's full width. For the terminal header, whose row has no slack left
   * at 1280px; a pane with room of its own should leave this off.
   */
  collapsible?: boolean
  className?: string
}

export function AssetClassBadge({
  cls,
  detail,
  size = 'sm',
  tooltip = true,
  collapsible = false,
  className,
}: AssetClassBadgeProps) {
  const { t } = useTranslation()
  const visual = assetClassVisual(cls)
  const Icon = assetClassIcon(cls)
  const name = t(visual.nameKey)

  const badge = (
    <span
      // The tinted pill is decoration; the words inside are the content. A
      // screen reader gets the class spelled out rather than "SPOT", and the
      // detail rides along in the same breath because it qualifies the class.
      aria-label={detail ? `${name}, ${detail}` : name}
      className={cn(
        'inline-flex shrink-0 select-none items-center border font-semibold uppercase leading-none',
        SIZES[size],
        visual.text,
        visual.bg,
        visual.border,
        className,
      )}
    >
      {collapsible ? (
        <Icon aria-hidden className={cn('size-[11px]', COLLAPSED_ONLY)} />
      ) : null}
      <span aria-hidden className={collapsible ? WIDE_ONLY : undefined}>
        {t(visual.labelKey)}
      </span>
      {detail ? (
        <>
          {/* Not a bullet character in the text: a middot inside the label
              would land in the accessible name and be read out loud. */}
          <span
            aria-hidden
            className={cn('opacity-45', collapsible && WIDE_ONLY)}
          >
            ·
          </span>
          {/* The detail is a proper noun ('Solana', 'Pre-market'), so it keeps
              its own casing where the class label is a shouted token. */}
          <span
            aria-hidden
            className={cn(
              'normal-case opacity-90',
              collapsible ? WIDE_ONLY : undefined,
            )}
          >
            {detail}
          </span>
        </>
      ) : null}
    </span>
  )

  if (!tooltip) return badge

  return (
    <Tooltip>
      {/* A real box, not `display: contents`: Base UI anchors the popup to the
          trigger's rect, and a contents element has none — the tooltip landed
          in the top-left corner of the window. */}
      <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
        {badge}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="font-medium">{name}</div>
        <div className="max-w-52 text-xs text-muted-foreground">
          {t(visual.descriptionKey)}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
