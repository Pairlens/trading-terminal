// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Odds or candles, in the slot the timeframe chip uses on every other market.
 *
 * The trade it makes is the reason it exists rather than being a setting three
 * screens away. The odds view answers "who is winning and by how much" and
 * gives up the drawing toolbar and the Trade screen's draggable limit line,
 * both of which convert price to pixels through the chart engine that view
 * unmounts. Candles bring both back and show one outcome. That is a decision a
 * trader makes several times in a session, so it belongs on the chart.
 *
 * Two segments rather than one toggling chip: a single chip has to be labelled
 * either with the state or with the action, and at 402px there is no room to
 * disambiguate which. Icons only, because "Probability" does not fit beside a
 * price readout and an abbreviation of it is worse than a glyph.
 */
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { CandlestickChart, Percent } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { PRESS } from '../primitives/press'
import { haptic } from '@/lib/haptics'
import { track } from '@/lib/analytics-events'

export type PredictionChartView = 'odds' | 'candles'

/**
 * A 30px segment with a ±7px expansion: 44px of hit area inside a 36px chip,
 * without the two segments' targets overlapping each other.
 */
const SEGMENT =
  'pl-press relative flex h-[30px] w-[38px] items-center justify-center rounded-lg after:absolute after:inset-y-[-7px] after:inset-x-[-3px] after:content-[""]'

export default memo(function PredictionViewChip({
  onChange,
  view,
}: {
  onChange: (view: PredictionChartView) => void
  view: PredictionChartView
}) {
  const { t } = useTranslation()

  const select = (next: PredictionChartView) => {
    if (next === view) return
    haptic('selection')
    onChange(next)
    track('mobile_prediction_chart_view', { view: next })
  }

  return (
    <div
      aria-label={t('mobile.predictions.chartView')}
      className="pl-ring-chart flex h-9 items-center gap-0.5 rounded-[10px] p-[3px]"
      role="group"
    >
      <button
        aria-label={t('mobile.predictions.chartViewOdds')}
        aria-pressed={view === 'odds'}
        className={cn(
          SEGMENT,
          view === 'odds'
            ? 'bg-foreground text-background'
            : 'text-[color:var(--pl-chart-fg)] opacity-70',
        )}
        onClick={() => select('odds')}
        type="button"
        {...PRESS}
      >
        <Percent aria-hidden className="size-[15px]" />
      </button>
      <button
        aria-label={t('mobile.predictions.chartViewCandles')}
        aria-pressed={view === 'candles'}
        className={cn(
          SEGMENT,
          view === 'candles'
            ? 'bg-foreground text-background'
            : 'text-[color:var(--pl-chart-fg)] opacity-70',
        )}
        onClick={() => select('candles')}
        type="button"
        {...PRESS}
      >
        <CandlestickChart aria-hidden className="size-[15px]" />
      </button>
    </div>
  )
})
