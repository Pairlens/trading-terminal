// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Pause, Play, SkipForward, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10]

/**
 * TradingView-style bar replay controls — rendered as a floating bar over
 * the chart while replay mode is active.
 */
export function ReplayControls() {
  const { t } = useTranslation()
  const { replayActive, replayCursor, replayTotal } = useChartConfig()
  const { exitReplay, stepReplay, toggleReplayPlay, setReplaySpeed } =
    useChartActions()

  if (!replayActive) return null

  const done = replayCursor.position >= replayTotal
  const progress =
    replayTotal > 0
      ? Math.round((replayCursor.position / replayTotal) * 100)
      : 0

  return (
    <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-border/60 bg-background/95 px-2 py-1 shadow-lg backdrop-blur">
      <span className="px-1 font-mono text-[11px] uppercase tracking-wide text-amber-500">
        {t('chart.replay.title')}
      </span>

      <Button
        size="sm"
        variant="ghost"
        className="size-7 p-0"
        disabled={done}
        onClick={toggleReplayPlay}
        aria-label={
          replayCursor.playing
            ? t('chart.replay.pause')
            : t('chart.replay.play')
        }
      >
        {replayCursor.playing ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="size-7 p-0"
        disabled={done}
        onClick={stepReplay}
        aria-label={t('chart.replay.step')}
      >
        <SkipForward className="size-3.5" />
      </Button>

      <Select
        value={String(replayCursor.speed)}
        onValueChange={(v) => setReplaySpeed(Number(v))}
      >
        <SelectTrigger className="h-7 w-16 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPEED_OPTIONS.map((speed) => (
            <SelectItem key={speed} value={String(speed)}>
              {speed}x
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="min-w-16 px-1 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {replayCursor.position}/{replayTotal} ({progress}%)
      </span>

      <Button
        size="sm"
        variant="ghost"
        className="size-7 p-0"
        onClick={exitReplay}
        aria-label={t('chart.replay.exit')}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
