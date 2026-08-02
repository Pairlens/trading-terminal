// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Activity, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'

type Regime = 'trend' | 'chop'
type Decision = 'APPROVE' | 'BLOCK' | 'WATCH'

type Signal = {
  decision: Decision
  confidence: number
  summary: string
}

type CopilotSignalCardProps = {
  regime: Regime
  signal: Signal | null
}

const DECISION_VARIANTS: Record<
  Decision,
  'default' | 'destructive' | 'secondary'
> = {
  APPROVE: 'default',
  BLOCK: 'destructive',
  WATCH: 'secondary',
}

export function CopilotSignalCard({ regime, signal }: CopilotSignalCardProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 border-b pb-3">
      {/* Regime */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {t('copilot.marketRegime')}
        </p>
        <Badge variant="outline" className="gap-1 text-[11px]">
          {regime === 'trend' ? (
            <TrendingUp className="size-3" />
          ) : (
            <Activity className="size-3" />
          )}
          {regime === 'trend' ? t('copilot.trending') : t('copilot.choppy')}
        </Badge>
      </div>

      {/* Signal card */}
      {signal && (
        <div className="space-y-1.5 rounded-lg border p-2.5">
          <div className="flex items-center justify-between">
            <Badge
              variant={DECISION_VARIANTS[signal.decision]}
              className="text-[10px]"
            >
              {signal.decision}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {(signal.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {signal.summary}
          </p>
        </div>
      )}
    </div>
  )
}
