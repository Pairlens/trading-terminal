// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { useLatencyProbe } from '@/hooks/use-latency-probe'
import { useVenueLatency } from '@/hooks/use-venue-latency'

/**
 * Round-trip time to the venue's market-data socket, sitting beside the Live
 * dot: that one says whether data is arriving, this one says how far away it
 * is coming from.
 *
 * Two things can be shown, and the tooltip always says which:
 * - a MEASURED round trip, from the venue's keepalive
 * - an ESTIMATE, from how old the venue's own trade timestamps are, corrected
 *   for this machine's clock offset — for venues that answer no ping we can
 *   time (Coinbase, HTX, Crypto.com heartbeat server-side)
 *
 * Renders nothing when there is neither. Alpaca and the DEX connectors publish
 * no per-event venue timestamp at all, and a venue that has just gone quiet
 * expires with the connection that produced its number. An em dash in the
 * header would read as a fault rather than as "not measured here".
 */

// Bars and colour by round trip. Calibrated against what a retail connection
// to these venues actually looks like, not against a colocation SLA: a venue
// on your own continent lands under ~150ms, and reaching an Asian exchange
// from Europe or the Americas sits comfortably in the 200-350ms band. Amber
// starts at 400ms, where the delay stops being geography and starts being a
// problem — dressing an ordinary transatlantic hop as a warning would train
// people to ignore the colour entirely.
const TIERS = [
  { maxMs: 150, bars: 3, bar: 'bg-emerald-400', text: 'text-muted-foreground' },
  { maxMs: 400, bars: 2, bar: 'bg-emerald-400', text: 'text-muted-foreground' },
  { maxMs: 900, bars: 1, bar: 'bg-amber-400', text: 'text-amber-400' },
  {
    maxMs: Number.POSITIVE_INFINITY,
    bars: 1,
    bar: 'bg-red-400',
    text: 'text-red-400',
  },
] as const

const BAR_HEIGHTS = ['h-[3px]', 'h-[5px]', 'h-[7px]'] as const

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

export function LatencyIndicator({
  market,
  pairKey,
  venueLabel,
}: {
  market: string
  /** Active pair, so the probe can join the tape the panes already share. */
  pairKey: string
  /** Venue display name for the tooltip; falls back to the market id. */
  venueLabel?: string
}) {
  const { t } = useTranslation()
  const latency = useVenueLatency(market)
  const measured = latency?.source === 'roundtrip'

  // Above the early return, and passed `measured` rather than the whole
  // reading: this must not resubscribe every time a sample lands, only when
  // the venue crosses from unmeasured to measured.
  useLatencyProbe(market, pairKey, measured)

  if (!latency) return null

  const tier = TIERS.find((x) => latency.medianMs <= x.maxMs) ?? TIERS[3]
  const value = formatMs(latency.medianMs)
  const venue = venueLabel || market

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="flex cursor-default items-center gap-1"
            aria-label={t('connection.latencyAria', { value })}
          />
        }
      >
        <span className="flex h-[7px] items-end gap-[1px]" aria-hidden="true">
          {BAR_HEIGHTS.map((height, i) => (
            <span
              key={height}
              className={cn(
                'w-[2px] rounded-[1px]',
                height,
                i < tier.bars ? tier.bar : 'bg-muted-foreground/25',
              )}
            />
          ))}
        </span>
        {/* Tabular numerals: the value changes every keepalive, and
            proportional digits would jitter the whole header with it. */}
        <span
          className={cn(
            'font-mono text-[10px] font-medium tabular-nums',
            tier.text,
          )}
        >
          {/* A leading ~ marks the estimate, so the distinction the tooltip
              spells out survives at a glance without a second word of chrome. */}
          {measured ? value : `~${value}`}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="font-medium">
          {measured
            ? t('connection.latencyTooltipTitle', { venue })
            : t('connection.latencyEstimateTitle', { venue })}
        </div>
        <div className="opacity-80">
          {measured
            ? t('connection.latencyTooltipDetail', {
                best: formatMs(latency.bestMs),
              })
            : t('connection.latencyEstimateDetail')}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
