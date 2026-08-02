// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Separator } from '@pairlens/ui/components/ui/separator'
import type { SignalPayload } from '@pairlens/shared/types'

type IntelligenceStripProps = {
  signal: SignalPayload | null
}

export function IntelligenceStrip({ signal }: IntelligenceStripProps) {
  const { t } = useTranslation()

  const isLong = signal?.direction === 'long'
  const strategyLabel = signal?.strategy.replace(/_/g, ' ') ?? ''

  return (
    <div className="flex h-7 items-center gap-2.5 border-t px-3">
      {!signal ? (
        <span className="text-[11px] text-muted-foreground">
          {t('intelligence.awaitingSignal')}
        </span>
      ) : (
        <>
          {/* Regime */}
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('intelligence.regime')}
            </span>
            <Badge variant="outline" className="gap-1 text-[11px]">
              {signal.regime === 'trend' ? (
                <TrendingUp className="size-3" />
              ) : (
                <Activity className="size-3" />
              )}
              {signal.regime === 'trend'
                ? t('intelligence.trending')
                : t('intelligence.choppy')}
            </Badge>
          </div>

          <Separator orientation="vertical" className="self-stretch" />

          {/* Direction */}
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={isLong ? 'default' : 'destructive'}
              className="gap-1 text-[10px]"
            >
              {isLong ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {isLong ? 'LONG' : 'SHORT'}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {(signal.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <Separator orientation="vertical" className="self-stretch" />

          {/* Strategy */}
          <p className="min-w-0 truncate text-xs capitalize text-muted-foreground">
            {strategyLabel}
          </p>
        </>
      )}
    </div>
  )
}
