// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from '@pairlens/ui/components/ui/command'
import { cn } from '@pairlens/ui'

import { parseMarketRefPath } from '@pairlens/shared/market-ref'
import { CategoryTabs } from './category-tabs'
import {
  ActionResultItem,
  MarketResultItem,
  NotificationResultItem,
  PageResultItem,
  PairResultItem,
  PaneResultItem,
  PluginResultItem,
  WorkflowResultItem,
  WorkspaceResultItem,
} from './result-items'
import { SearchFooter } from './search-footer'
import { useOmniSearchResults } from './use-omni-search-results'
import type { OmniSearchCategory, OmniSearchResult } from './omni-search-types'
import { track } from '@/lib/analytics-events'
import { useSwitchVenue } from '@/hooks/use-switch-venue'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useNotificationStore } from '@/stores/notification-store'
import { usePaneAddRequestStore } from '@/stores/pane-add-request-store'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { useRecentPairs } from '@/lib/recent-tickers'
import { entryToMarketRef } from '@/lib/market-ref/entry'
import { chartLinkProps } from '@/lib/market-ref/link'

type OmniSearchPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CATEGORY_ORDER: Array<OmniSearchCategory> = [
  'all',
  'pairs',
  'markets',
  'pages',
  'workspaces',
  'workflows',
  'notifications',
  'panes',
  'plugins',
  'actions',
]

const MAX_RECENT_ACTIONS = 8

/** Routes that render a pane layout and can receive an added pane. */
function pathHasLayout(pathname: string): boolean {
  return (
    pathname === '/' ||
    Boolean(parseMarketRefPath(pathname)) ||
    pathname.startsWith('/pair/') ||
    (pathname.startsWith('/workspace/') &&
      !pathname.startsWith('/workspace-store'))
  )
}

export function OmniSearchPalette({
  open,
  onOpenChange,
}: OmniSearchPaletteProps) {
  const { t } = useTranslation()
  useEffect(() => {
    if (open) track('command_palette_opened')
  }, [open])
  const navigate = useNavigate()
  const switchVenue = useSwitchVenue()
  const [searchValue, setSearchValue] = useState('')
  const [activeCategory, setActiveCategory] =
    useState<OmniSearchCategory>('all')
  // The shared store rather than a third writer to `pair-picker.recent`.
  const [, trackRecent] = useRecentPairs()
  const resolveMarket = usePreferredMarketResolver()
  const [recentActionIds, setRecentActionIds] = usePersistedState<
    Array<string>
  >('omni-search.recent-actions', [])
  const selectWorkflow = useWorkflowStore((s) => s.selectWorkflow)
  const startEditingWorkflow = useWorkflowStore((s) => s.startEditing)
  const selectNotifRule = useNotificationStore((s) => s.selectRule)
  const startEditingNotif = useNotificationStore((s) => s.startEditing)
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  const { groups, categoryCounts, isLoading, prefixCategory } =
    useOmniSearchResults(searchValue, activeCategory, recentActionIds)

  const close = useCallback(() => {
    onOpenChange(false)
    setSearchValue('')
    setActiveCategory('all')
  }, [onOpenChange])

  const handleSelect = useCallback(
    (result: OmniSearchResult) => {
      switch (result.type) {
        case 'pair': {
          const { symbol, assetClass } = result.pair
          if (assetClass) {
            setAssetClassMap((prev) => ({ ...prev, [symbol]: assetClass }))
          }
          const ref = entryToMarketRef(result.pair, resolveMarket(assetClass))
          trackRecent(ref)
          void navigate(chartLinkProps(ref))
          break
        }
        case 'market': {
          // What a venue switch moves depends on where it lands: on a pair
          // page the venue is in the URL, so this navigates and the chart,
          // the book and the ticket all follow. Everywhere else there is no
          // chart to move and it only writes the venue preference, which has
          // no visible surface, so that is the case that gets a toast.
          const scope = switchVenue(result.marketId)
          if (scope === 'preference') {
            toast.success(t('search.marketSwitched', { name: result.label }))
          }
          break
        }
        case 'page':
          void navigate({ to: result.path as '/' })
          break
        case 'workspace':
          void navigate({
            to: '/workspace/$workspaceId',
            params: { workspaceId: result.id },
          })
          break
        case 'workflow':
          selectWorkflow(result.id)
          startEditingWorkflow(result.id)
          void navigate({ to: '/workflows' })
          break
        case 'notification':
          selectNotifRule(result.id)
          startEditingNotif(result.id)
          void navigate({ to: '/notifications' })
          break
        case 'pane': {
          // Enter add-pane placement mode on the active layout; if the
          // current route has no layout, land on Discovery first.
          usePaneAddRequestStore.getState().requestPane(result.paneType)
          if (!pathHasLayout(window.location.pathname)) {
            void navigate({ to: '/' })
          }
          break
        }
        case 'plugin':
          void navigate({
            to: '/plugins',
            search: { manage: result.id },
          })
          break
        case 'action':
          setRecentActionIds((prev) =>
            [result.id, ...prev.filter((id) => id !== result.id)].slice(
              0,
              MAX_RECENT_ACTIONS,
            ),
          )
          result.execute()
          break
      }
      close()
    },
    [
      close,
      navigate,
      switchVenue,
      t,
      trackRecent,
      resolveMarket,
      setAssetClassMap,
      setRecentActionIds,
      selectWorkflow,
      startEditingWorkflow,
      selectNotifRule,
      startEditingNotif,
    ],
  )

  // A new query (or tab) starts a new list, so it starts at the top. cmdk
  // only scrolls when the selected VALUE changes — when consecutive queries
  // keep the same top result ("so" → "sol", both led by SOL-USDT) it leaves
  // the list wherever it was, and async result waves landing later would
  // drift a non-zero offset further via browser scroll anchoring.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [searchValue, activeCategory])

  // Tab key cycles through categories (disabled while a prefix scopes the search)
  const commandRef = useRef<HTMLDivElement>(null)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        if (prefixCategory) return
        // Cycle only through tabs that are actually rendered — empty
        // categories are hidden, so stepping onto one would strand the
        // selection on an invisible tab.
        const visible = CATEGORY_ORDER.filter(
          (cat) => cat === 'all' || categoryCounts[cat] > 0,
        )
        const currentIdx = visible.indexOf(activeCategory)
        // If the active category just emptied out it is no longer visible;
        // restart the cycle from the edge we're entering from.
        const nextIdx =
          currentIdx === -1
            ? e.shiftKey
              ? visible.length - 1
              : 0
            : e.shiftKey
              ? (currentIdx - 1 + visible.length) % visible.length
              : (currentIdx + 1) % visible.length
        setActiveCategory(visible[nextIdx])
      }
    },
    [activeCategory, prefixCategory, categoryCounts],
  )

  const hasResults = groups.some((g) => g.results.length > 0)

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
        else onOpenChange(next)
      }}
      title={t('search.omniTitle')}
      description={t('search.omniDescription')}
      className="max-w-xl! rounded-2xl! border-border bg-popover shadow-xl"
    >
      <Command
        shouldFilter={false}
        ref={commandRef}
        onKeyDown={handleKeyDown}
        className="rounded-2xl! bg-transparent"
      >
        <CommandInput
          placeholder={t('search.omniPlaceholder')}
          value={searchValue}
          onValueChange={setSearchValue}
        />
        <CategoryTabs
          active={prefixCategory ?? activeCategory}
          onChange={setActiveCategory}
          counts={categoryCounts}
          locked={prefixCategory !== null}
          isLoading={isLoading}
        />
        <CommandList ref={listRef} className="max-h-80">
          {!hasResults && <CommandEmpty>{t('search.noResults')}</CommandEmpty>}

          {groups.map((group) => (
            <CommandGroup
              key={group.category}
              heading={group.label}
              className={cn(
                '**:[[cmdk-group-heading]]:font-mono **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-normal **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-[.14em]',
                // Dim pair rows while a fresh server search is in flight so
                // held-over results from the previous query read as stale.
                group.category === 'pairs' &&
                  isLoading &&
                  'opacity-50 transition-opacity duration-[var(--dur-fast)]',
              )}
            >
              {group.results.map((result) => (
                <ResultItem
                  key={resultKey(result)}
                  result={result}
                  onSelect={() => handleSelect(result)}
                />
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <SearchFooter />
      </Command>
    </CommandDialog>
  )
}

// ── Result dispatcher ─────────────────────────────────────────────

function ResultItem({
  result,
  onSelect,
}: {
  result: OmniSearchResult
  onSelect: () => void
}) {
  switch (result.type) {
    case 'pair':
      return <PairResultItem result={result} onSelect={onSelect} />
    case 'market':
      return <MarketResultItem result={result} onSelect={onSelect} />
    case 'page':
      return <PageResultItem result={result} onSelect={onSelect} />
    case 'workspace':
      return <WorkspaceResultItem result={result} onSelect={onSelect} />
    case 'workflow':
      return <WorkflowResultItem result={result} onSelect={onSelect} />
    case 'notification':
      return <NotificationResultItem result={result} onSelect={onSelect} />
    case 'pane':
      return <PaneResultItem result={result} onSelect={onSelect} />
    case 'plugin':
      return <PluginResultItem result={result} onSelect={onSelect} />
    case 'action':
      return <ActionResultItem result={result} onSelect={onSelect} />
  }
}

function resultKey(result: OmniSearchResult): string {
  switch (result.type) {
    case 'pair':
      return `pair:${result.pair.symbol}`
    case 'market':
      return `market:${result.marketId}`
    case 'page':
      return `page:${result.id}`
    case 'workspace':
      return `workspace:${result.id}`
    case 'workflow':
      return `workflow:${result.id}`
    case 'notification':
      return `notification:${result.id}`
    case 'pane':
      return `pane:${result.paneType}`
    case 'plugin':
      return `plugin:${result.id}`
    case 'action':
      return `action:${result.id}`
  }
}
