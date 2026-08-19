// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Rotation as a grid of rows: which sectors are bid, which are being sold, and
 * how one-sided each of those is. Each row is anchored by its own colour rail,
 * whose strength is the size of the move; the card frame that used to do that
 * job was a second border inside the column's own.
 *
 * The aggregate percentage is capitalisation-weighted (see `sector-stats.ts`),
 * so a row says what holding the sector would have done rather than what the
 * average member did. Beside it, the breadth bar is what stops that number
 * from being read as agreement: "+4.2%" from twelve assets moving together and
 * "+4.2%" from one asset dragging eleven flat ones are different markets, and
 * the bar is the only place that difference shows.
 *
 * Clicking a row filters the markets scanner to that sector rather than
 * navigating: the scanner and the tape share the same persisted category, so
 * the click lands on the board the user is already looking at. The default
 * spot board no longer carries that scanner, so there the click records the
 * sector and waits for one: adding the panel, or opening the Markets board,
 * picks the selection straight up.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Boxes } from 'lucide-react'

import { cn } from '@pairlens/ui'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@pairlens/ui/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type { InstrumentCategory } from '@pairlens/shared/instrument-types'
import type { SectorSummary, SectorWindow } from '@/lib/sector-stats'
import { summarizeSectors } from '@/lib/sector-stats'
import { useSectorMembership } from '@/hooks/use-sector-membership'
import {
  useTopCoinsSnapshot,
  useTopCoinsSnapshotState,
} from '@/hooks/use-top-coins-snapshot'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { buildSparkline } from '@/lib/sparkline-path'
import { PaneEmpty } from '@/components/panes/pane-primitives'

const WINDOWS: ReadonlyArray<SectorWindow> = ['24h', '7d']

/** The scanner's own category key — writing it is what filters that pane. */
const SCANNER_CATEGORY_KEY = 'pair-picker.category'

export function SectorTapePane() {
  const { t } = useTranslation()
  const coins = useTopCoinsSnapshot()
  const state = useTopCoinsSnapshotState()
  const membership = useSectorMembership()
  const [window, setWindow] = usePersistedState<SectorWindow>(
    'sectorTape.window',
    '24h',
  )
  const [scannerCategory, setScannerCategory] = usePersistedState<string>(
    SCANNER_CATEGORY_KEY,
    'all',
  )

  const sectors = useMemo(
    () => summarizeSectors(membership.membersOf, coins, window),
    [membership.membersOf, coins, window],
  )

  if (state === 'unavailable' || (membership.ready && sectors.length === 0)) {
    return (
      <PaneEmpty
        icon={Boxes}
        title={t('sectorTape.emptyTitle')}
        body={t('sectorTape.emptyBody')}
      />
    )
  }

  const loading = state === 'loading' || !membership.ready

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* The pane's name is the shell's now, so the row it used to share with
          the window toggle carries the caption instead: what the weighting is
          and what the breadth bar counts. Truncated, with the full sentence on
          hover, because on a docked rail the toggle is what has to fit. */}
      <div className="flex shrink-0 items-center gap-2 pb-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" />
            }
          >
            {t('sectorTape.subtitle')}
          </TooltipTrigger>
          <TooltipContent>{t('sectorTape.subtitle')}</TooltipContent>
        </Tooltip>
        <ToggleGroup
          aria-label={t('sectorTape.window')}
          multiple={false}
          size="sm"
          value={[window]}
          variant="outline"
          className="shrink-0"
          onValueChange={(next) => {
            const value = next[0]
            if (value && WINDOWS.includes(value as SectorWindow)) {
              setWindow(value as SectorWindow)
            }
          }}
        >
          {WINDOWS.map((id) => (
            <ToggleGroupItem
              key={id}
              value={id}
              className="h-6 min-w-6 px-1.5 font-mono text-[10px]"
            >
              {id}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Three columns, capped. The six curated sectors are meant to sit 3×2
          and be read as a block; letting auto-fill run to five across at the
          board's own width turned the tape into one long row of thin cells
          with an orphan underneath. Below 31rem the cap lifts and the rows
          fall back to filling whatever the dock gives them. */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-1">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3 gap-y-1 @min-[31rem]/pane:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="h-[4.25rem] animate-pulse rounded-md bg-muted/40"
                />
              ))
            : sectors.map((sector) => (
                <SectorChip
                  key={sector.category}
                  sector={sector}
                  selected={scannerCategory === sector.category}
                  onSelect={(category) =>
                    setScannerCategory(
                      scannerCategory === category ? 'all' : category,
                    )
                  }
                />
              ))}
        </div>
      </div>
    </div>
  )
}

function SectorChip({
  sector,
  selected,
  onSelect,
}: {
  sector: SectorSummary
  selected: boolean
  onSelect: (category: InstrumentCategory) => void
}) {
  const { t } = useTranslation()
  const up = sector.changePct >= 0
  const moved = sector.advancing + sector.declining
  // The rail is what a border and a tinted card used to do together, and it is
  // the one thing on the row that is the sector's own colour. Its strength
  // follows the size of the move, floored so a flat sector still has an anchor
  // and capped at full so a violent day does not read as a different control.
  const strength = Math.min(1, 0.35 + Math.abs(sector.changePct) * 0.13)
  const geometry = buildSparkline(sector.trajectory, 60, 18, 1.5)

  const mover = up ? sector.leader : sector.laggard

  return (
    <button
      type="button"
      onClick={() => onSelect(sector.category)}
      aria-pressed={selected}
      className={cn(
        'flex min-w-0 items-stretch gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-accent/40',
        selected && 'bg-muted/60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'w-[3px] shrink-0 rounded-full',
          up ? 'bg-up' : 'bg-down',
        )}
        style={{ opacity: strength }}
      />

      <span className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12.5px] font-medium">
            {t(`markets.category.${sector.category}`)}
          </span>
          <span
            className={cn(
              'shrink-0 font-mono text-[15px] font-semibold tabular-nums',
              up ? 'text-up' : 'text-down',
            )}
          >
            {up ? '+' : ''}
            {sector.changePct.toFixed(1)}%
          </span>
        </span>

        {/* Breadth: the up side fills a track the down side owns, so a sector
            carried by one name reads differently from one moving together. */}
        {moved > 0 && (
          <span className="block h-1 overflow-hidden rounded-sm [background-color:var(--down)]">
            <span
              className="block h-full [background-color:var(--up)]"
              style={{
                width: `${((sector.advancing / moved) * 100).toFixed(1)}%`,
              }}
            />
          </span>
        )}

        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {/* Three captions, because three things can be true. A sector with
              a side names the name carrying it; one whose members split down
              the middle says so, since picking a leader out of 6-up-5-down
              would be a coin flip dressed as a finding. */}
            {sector.split
              ? t('sectorTape.splitTape', { total: sector.members })
              : mover
                ? t(up ? 'sectorTape.leads' : 'sectorTape.drags', {
                    total: sector.members,
                    symbol: mover.symbol,
                  })
                : t('sectorTape.assets', { total: sector.members })}
          </span>
          {geometry && (
            <svg
              viewBox="0 0 60 18"
              preserveAspectRatio="none"
              aria-hidden
              className={cn('h-4 w-14 shrink-0', up ? 'text-up' : 'text-down')}
            >
              <path
                d={geometry.line}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </span>
      </span>
    </button>
  )
}
