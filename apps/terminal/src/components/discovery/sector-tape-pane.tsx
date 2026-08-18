// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Rotation as a row of chips: which sectors are bid, which are being sold, and
 * how one-sided each of those is.
 *
 * The aggregate percentage is capitalisation-weighted (see `sector-stats.ts`),
 * so a chip says what holding the sector would have done rather than what the
 * average member did. Beside it, the breadth bar is what stops that number
 * from being read as agreement: "+4.2%" from twelve assets moving together and
 * "+4.2%" from one asset dragging eleven flat ones are different markets, and
 * the bar is the only place that difference shows.
 *
 * Clicking a chip filters the markets scanner beside it to that sector rather
 * than navigating: the scanner and the tape share the same persisted category,
 * so the click lands on the board the user is already looking at.
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
      {/* Title and window on one line. The subtitle that used to sit here
          explained the weighting and the breadth bar, which is a caption for
          a chip the reader has already looked at — it rides the title as a
          tooltip now and gives the grid back a row of height. */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold" />
            }
          >
            {t('sectorTape.title')}
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
              className="px-1.5 font-mono text-[10px]"
            >
              {id}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Three columns, capped. The six curated sectors are meant to sit 3×2
          and be read as a block; letting auto-fill run to five across at the
          board's own width turned the tape into one long row of thin chips
          with an orphan underneath. Below 31rem the cap lifts and the cards
          fall back to filling whatever the dock gives them. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 @min-[31rem]/pane:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="h-[4.5rem] animate-pulse rounded-lg bg-muted/50"
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
  // Tint depth follows the size of the move, capped so a violent day does not
  // wash the label out. 12% is where the chip is clearly coloured and the
  // 13px name is still legible on both themes.
  const tint = Math.min(12, Math.abs(sector.changePct) * 2.5).toFixed(1)
  const geometry = buildSparkline(sector.trajectory, 60, 18, 1.5)

  const mover = up ? sector.leader : sector.laggard

  return (
    <button
      type="button"
      onClick={() => onSelect(sector.category)}
      aria-pressed={selected}
      className={cn(
        'flex min-w-0 flex-col justify-between gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-primary/40',
        selected && 'border-primary/60',
      )}
      style={{
        background: `linear-gradient(180deg,color-mix(in oklch,var(--${up ? 'up' : 'down'}) ${tint}%,transparent),transparent)`,
      }}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-medium">
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
    </button>
  )
}
