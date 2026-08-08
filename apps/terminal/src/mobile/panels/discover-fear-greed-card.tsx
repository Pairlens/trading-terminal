// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fear & Greed, as one stat card.
 *
 * `FearGreedPane` is deliberately NOT mounted here. It is a pane: it wants a
 * `@container/pane` ancestor (which mobile never provides — see the blueprint's
 * container-query rule), it reads its fetch from the plugin host context, and
 * it draws a recharts history the design does not show. What is shared is the
 * part worth sharing: `fetchFearGreedWithFallback`, so the phone gets the same
 * App-Server-then-alternative.me path and the same cache semantics.
 *
 * Classification comes from the value's bucket rather than the API's English
 * label, so the word is translated rather than passed through.
 *
 * The query key is the pane's own `['fear-greed']`, and the detail screen this
 * card opens reuses it: the history is already in the cache by the time the
 * screen mounts, so the tap opens a drawn chart rather than a spinner.
 */
import { memo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions } from '../mobile-focus-context'
import { StatCard } from './discover-pnl-card'
import type { FearGreedResponse } from '@pairlens/shared/instrument-types'
import { appServerUrl, authFetch } from '@/lib/api'
import { fetchFearGreedWithFallback } from '@/lib/public-market-data'

/** The five buckets `getValueColor` uses in the pane, as catalog keys. */
export function classificationKey(value: number): string {
  if (value <= 25) return 'fearGreed.classification.extremeFear'
  if (value <= 45) return 'fearGreed.classification.fear'
  if (value <= 55) return 'fearGreed.classification.neutral'
  if (value <= 75) return 'fearGreed.classification.greed'
  return 'fearGreed.classification.extremeGreed'
}

export function toneFor(value: number): string {
  if (value <= 45) return 'text-down'
  if (value <= 55) return 'text-muted-foreground'
  return 'text-up'
}

/** Shared by the card and the detail screen, so one tap does not restate it. */
export const FEAR_GREED_QUERY_KEY = ['fear-greed'] as const

export function useFearGreed() {
  return useQuery({
    queryKey: FEAR_GREED_QUERY_KEY,
    queryFn: (): Promise<FearGreedResponse> =>
      fetchFearGreedWithFallback((path) => authFetch(`${appServerUrl}${path}`)),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  })
}

/**
 * Fear → greed as one continuous scale, mixed from the two P&L tokens so it
 * tracks the theme instead of pinning five hexes. `null` marks nothing, which
 * is what the legend on the detail screen wants.
 */
export function FearGreedScale({
  value,
  className,
}: {
  value: number | null
  className?: string
}) {
  return (
    <div
      className={cn('relative h-1.5 rounded-full', className)}
      style={{
        background:
          'linear-gradient(90deg, var(--down), color-mix(in oklch, var(--down), var(--up)), var(--up))',
      }}
    >
      {value == null ? null : (
        <span
          aria-hidden
          className="absolute top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
          style={{ left: `${Math.max(0, Math.min(100, value))}%` }}
        />
      )}
    </div>
  )
}

export const DiscoverFearGreedCard = memo(function DiscoverFearGreedCard() {
  const { t } = useTranslation()
  const { pushOverlay } = useMobileActions()
  const { data, isLoading } = useFearGreed()

  const value = data?.latest.value ?? null

  const open = useCallback(
    () => pushOverlay({ kind: 'fearGreed' }),
    [pushOverlay],
  )

  return (
    <StatCard label={t('fearGreed.title')} onPress={open}>
      {value == null ? (
        <p className="text-[12.5px] text-muted-foreground">
          {isLoading ? t('common.loading') : t('fearGreed.noData')}
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[30px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-foreground">
              {value}
            </span>
            <span
              className={cn('text-[12.5px] font-medium', toneFor(value))}
              // The classification is the number in words; it never wraps to a
              // second line at 402px because the card is half the screen.
            >
              {t(classificationKey(value))}
            </span>
          </div>
          <FearGreedScale className="mt-3" value={value} />
        </>
      )}
    </StatCard>
  )
})
