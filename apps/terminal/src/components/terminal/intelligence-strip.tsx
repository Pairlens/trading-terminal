// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Fragment, useEffect, useState } from 'react'
import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Separator } from '@pairlens/ui/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import { cn } from '@pairlens/ui/lib/utils'
import type { SignalPayload, SignalScan } from '@pairlens/strategy-engine'
import { formatRelativeTime } from '@/lib/format-time'

type IntelligenceStripProps = {
  scan: SignalScan | null
}

const HISTORY_LIMIT = 5

const STRATEGY_LABELS: Record<SignalPayload['strategy'], string> = {
  breakout: 'Breakout',
  ema_pullback: 'EMA Pullback',
  mean_reversion: 'Mean Reversion',
}

const strategyLabel = (s: SignalPayload) =>
  STRATEGY_LABELS[s.strategy] ?? s.strategy.replace(/_/g, ' ')

/** Coarse re-render tick so relative ages don't go stale between bar closes. */
function useMinuteTick(enabled: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [enabled])
}

/** LONG/SHORT chip on the --up/--down tokens, matching order/side chips. */
function DirectionChip({ signal }: { signal: SignalPayload }) {
  const isLong = signal.direction === 'long'
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
        isLong ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
      )}
    >
      {isLong ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {isLong ? 'LONG' : 'SHORT'}
    </span>
  )
}

export function IntelligenceStrip({ scan }: IntelligenceStripProps) {
  const { t } = useTranslation()

  const latest = scan?.signals[0] ?? null
  useMinuteTick(latest !== null && !latest.active)

  return (
    // The chart's closing line, not a footer: no rule above it, just the
    // 6px of air that separates it from the canvas.
    <div className="mt-1.5 flex h-6 shrink-0 items-center gap-2.5">
      {!scan ? (
        <span className="text-[11px] text-muted-foreground">
          {t('intelligence.analyzing')}
        </span>
      ) : (
        <>
          {/* Regime — always known once enough candles are buffered */}
          {scan.regime !== null && (
            <>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('intelligence.regime')}
                </span>
                <Badge variant="outline" className="gap-1 text-[11px]">
                  {scan.regime === 'trend' ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <Activity className="size-3" />
                  )}
                  {scan.regime === 'trend'
                    ? t('intelligence.trending')
                    : t('intelligence.choppy')}
                </Badge>
              </div>

              <Separator orientation="vertical" className="self-stretch" />
            </>
          )}

          {!latest ? (
            <span className="text-[11px] text-muted-foreground">
              {t('intelligence.noRecentSignals', { bars: scan.scannedBars })}
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={<div className="flex min-w-0 items-center gap-2.5" />}
              >
                <div className="flex shrink-0 items-center gap-2">
                  <DirectionChip signal={latest.signal} />
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {(latest.signal.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  {strategyLabel(latest.signal)}
                </p>

                {latest.active ? (
                  <span
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 text-[11px] font-medium',
                      latest.signal.direction === 'long'
                        ? 'text-up'
                        : 'text-down',
                    )}
                  >
                    <span
                      className={cn(
                        'live-dot size-1.5 rounded-full',
                        latest.signal.direction === 'long'
                          ? 'bg-up'
                          : 'bg-down',
                      )}
                    />
                    {t('intelligence.live')}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {formatRelativeTime(latest.firstTs)}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="px-3 py-2">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide opacity-60">
                  {t('intelligence.recentSignals')}
                </p>
                <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2.5 gap-y-1">
                  {scan.signals.slice(0, HISTORY_LIMIT).map((s) => (
                    <Fragment key={`${s.signal.strategy}-${s.firstTs}`}>
                      <DirectionChip signal={s.signal} />
                      <span className="text-xs">{strategyLabel(s.signal)}</span>
                      <span className="font-mono text-xs tabular-nums opacity-70">
                        {(s.signal.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="text-right text-xs opacity-70">
                        {s.active
                          ? t('intelligence.live')
                          : formatRelativeTime(s.firstTs)}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  )
}
