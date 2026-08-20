// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the on-chain Discovery panes draw while their provider is answering.
 *
 * The rule is the one `pane-skeletons` states and these follow literally: a
 * loading pane keeps its own shape. The map's placeholder is a treemap, big
 * tile and all, not a uniform grid of squares that reflows into a treemap the
 * moment data lands. The flow chart's is twelve bars around a midline with the
 * swap column beside them, at the real proportions.
 *
 * The second thing they do is explain themselves, but only once the wait has
 * earned it. Everything behind these panes comes from ONE metered provider on
 * a paced queue, so a cold board is genuinely a few seconds of work rather
 * than a stall — and a reader who is not told that reloads, which throws the
 * paced queue away and starts it again from cold. `useSlowLoad` holds the line
 * back until the wait is long enough to be worth a sentence.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'

import { Shimmer, SkeletonStatus } from '@/components/panes/pane-skeletons'
import { useSlowLoad } from '@/hooks/use-slow-load'

/**
 * The line under a skeleton that says why it is still a skeleton.
 *
 * Reserved height, so the pane does not jump when it appears four seconds in.
 */
function PacedNote({ show, children }: { show: boolean; children: string }) {
  return (
    <p
      className={cn(
        'mt-1.5 text-center text-[10px] leading-relaxed text-muted-foreground transition-opacity duration-500',
        show ? 'opacity-100' : 'opacity-0',
      )}
    >
      {children}
    </p>
  )
}

/**
 * Seven tiles in a treemap's proportions: one dominant pool, a couple of real
 * ones, and a tail. It is the shape almost every chain actually has, so the
 * swap to real tiles moves very little.
 */
const MAP_TILES: ReadonlyArray<string> = [
  'col-span-3 row-span-3',
  'col-span-2 row-span-2',
  'col-span-1 row-span-2',
  'col-span-2 row-span-1',
  'col-span-1 row-span-1',
  'col-span-3 row-span-1',
  'col-span-2 row-span-1',
  'col-span-1 row-span-1',
]

export function PoolMapSkeleton({ chainName }: { chainName: string | null }) {
  const { t } = useTranslation()
  const slow = useSlowLoad(true)

  return (
    <div className="flex min-h-0 flex-1 flex-col py-1.5" aria-busy="true">
      <SkeletonStatus label={t('poolMap.loadingLabel')} />
      <div className="grid min-h-0 flex-1 grid-cols-6 grid-rows-4 gap-1">
        {MAP_TILES.map((span, index) => (
          <Shimmer
            key={span + String(index)}
            delayIndex={index}
            className={cn('h-full w-full rounded-md', span)}
          />
        ))}
      </div>
      <PacedNote show={slow}>
        {chainName
          ? t('poolMap.pacedNoteChain', { chain: chainName })
          : t('poolMap.pacedNote')}
      </PacedNote>
    </div>
  )
}

/** Deterministic bar heights: a plausible hour of flow, not a flat row. */
const FLOW_BARS: ReadonlyArray<number> = [
  34, 58, 22, 71, 45, 30, 64, 18, 52, 40, 76, 28,
]
/** Which of them sit below the midline. Same shape every render. */
const FLOW_DOWN = new Set([2, 5, 7, 9])

export function LiquidityFlowSkeleton({ poolName }: { poolName?: string }) {
  const { t } = useTranslation()
  const slow = useSlowLoad(true)

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <SkeletonStatus label={t('liquidityFlow.loadingLabel')} />
      <div className="flex min-h-0 flex-1 gap-4 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The same midline the real chart grows from, so the bars do not
              jump across it when the tape lands. */}
          <div className="flex min-h-0 flex-1 items-stretch gap-1">
            {FLOW_BARS.map((height, index) => (
              <div
                key={index}
                className="flex min-w-0 flex-1 flex-col justify-center"
              >
                <div className="flex h-1/2 items-end">
                  {FLOW_DOWN.has(index) ? null : (
                    <Shimmer
                      delayIndex={index}
                      className="w-full rounded-t-sm"
                      style={{ height: `${height}%` }}
                    />
                  )}
                </div>
                <div className="h-px w-full bg-border" />
                <div className="flex h-1/2 items-start">
                  {FLOW_DOWN.has(index) ? (
                    <Shimmer
                      delayIndex={index}
                      className="w-full rounded-b-sm"
                      style={{ height: `${height}%` }}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <PacedNote show={slow}>
            {poolName
              ? t('liquidityFlow.pacedNotePool', { pool: poolName })
              : t('liquidityFlow.pacedNote')}
          </PacedNote>
        </div>

        <div className="w-px shrink-0 self-stretch bg-(--pane-rule)" />

        <div className="flex w-[42%] min-w-0 shrink-0 flex-col gap-2">
          <p className="text-[10px] text-muted-foreground">
            {t('liquidityFlow.biggestLabel')}
          </p>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-2">
              <Shimmer
                delayIndex={row}
                className="size-3 shrink-0 rounded-sm"
              />
              <Shimmer delayIndex={row} className="h-3 flex-1" />
              <Shimmer delayIndex={row} className="h-3 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
