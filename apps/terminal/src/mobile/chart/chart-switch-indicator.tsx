// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Give it a second" — the phone's version of the desktop pane transition.
 *
 * Switching pair or venue clears the candle buffer the instant the request
 * changes (see `use-candle-stream.ts`), so between a watchlist tap and the new
 * venue's first snapshot the chart is an empty grid under a price that reads
 * `—`. The desktop dims the pane and floats a badge over it; the phone had
 * nothing, and an empty plot for half a second reads as a broken market rather
 * than as a market on its way.
 *
 * The wording rule is the desktop's, via the same strings: name the venue only
 * when the venue is what changed (see `lib/chart-switch.ts`).
 */
import { memo } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Distance from the top of the chart band, in px.
 *
 * Not centred in the plot, on purpose. The chart's box is full height in every
 * view and panels COVER it (see `CHART_FRAME`), so a vertically centred badge
 * would sit behind the sheet on four of the five screens. 88px clears the hero
 * price readout — 8px of air, a 34px number, its 13.5px change line — and stays
 * inside the shortest band a panel leaves visible.
 */
const BADGE_TOP_PX = 88

export const ChartSwitchIndicator = memo(function ChartSwitchIndicator({
  /** Human venue name, shown only when the venue is what changed. */
  venueLabel,
  venueChanged,
}: {
  venueLabel: string
  venueChanged: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
      style={{ top: `${BADGE_TOP_PX}px` }}
    >
      {/* `role="status"` rather than `aria-hidden`: a screen reader user gets
          no signal at all from an empty canvas, so this is the one place on
          the chart band where the announcement is the whole point. */}
      <span
        className="pl-chart-switch inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-[12px] font-medium text-muted-foreground shadow-sm backdrop-blur"
        role="status"
      >
        <Loader2 className="pl-chart-switch-spin size-3.5" />
        {venueChanged
          ? t('layout.paneTransition.switchingTo', { venue: venueLabel })
          : t('layout.paneTransition.switching')}
      </span>
    </div>
  )
})
