// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'

import { DEFAULT_WATCHLIST_ID } from '@pairlens/persistence'
import type { DragEndEvent } from '@dnd-kit/core'

import type { Instrument } from '@pairlens/shared/instrument-types'
import { formatPrice } from '@/lib/format-price'
import { resolveMarketForAssetClass } from '@/lib/market-asset-classes'
import { useInstrumentsBySymbols } from '@/hooks/use-market-instruments'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useTickerStream } from '@/hooks/use-ticker-stream'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useActivePair } from '@/lib/active-pair-context'
import { useMarketData } from '@/lib/market-data-provider'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import { PairSearchResults } from '@/components/pair-picker/pair-search-results'
import { PaneTransition } from '@/components/layout/pane-transition'

export function WatchlistPane() {
  const { t } = useTranslation()
  const { activePair } = useActivePair()
  const state = useWatchlistsStore((s) => s.state)
  const removeFromWatchlist = useWatchlistsStore((s) => s.removeFromWatchlist)
  const reorderSymbols = useWatchlistsStore((s) => s.reorderSymbols)
  const setActiveList = useWatchlistsStore((s) => s.setActiveList)
  const createList = useWatchlistsStore((s) => s.createList)
  const deleteList = useWatchlistsStore((s) => s.deleteList)
  const renameList = useWatchlistsStore((s) => s.renameList)

  const lists = state.lists
  const activeList = lists.find((l) => l.id === state.activeListId) ?? lists[0]!

  // Sort symbols for the query key so reordering doesn't trigger a refetch
  const sortedSymbols = useMemo(
    () => [...activeList.symbols].sort(),
    [activeList.symbols],
  )
  const { items: instruments } = useInstrumentsBySymbols(sortedSymbols)

  const watchlistItems = useMemo(() => {
    if (!instruments.length) return []
    const bySymbol = new Map(instruments.map((i) => [i.symbol, i]))
    return activeList.symbols
      .map((sym) => bySymbol.get(sym))
      .filter((i): i is Instrument => i !== undefined)
  }, [activeList.symbols, instruments])

  // User's preferred market (last selected in the chart terminal).
  const { markets: availableMarkets, defaultMarket } = useAvailableMarkets()
  const [preferredMarket] = usePersistedState('terminal.market', defaultMarket)
  const validPreferred = availableMarkets.some(
    (m) => m.value === preferredMarket,
  )
    ? preferredMarket
    : defaultMarket
  const availableMarketValues = useMemo(
    () => availableMarkets.map((m) => m.value),
    [availableMarkets],
  )

  // Resolve each row's venue up front: a stocks instrument can't stream from a
  // crypto exchange, so it has to leave the sticky market for one that serves
  // its asset class. That decision needs the adapters' declared asset classes —
  // without them every venue looks compatible and stock rows never reprice.
  const { availableMarkets: adapterInfos } = useMarketData()
  const marketBySymbol = useMemo(
    () =>
      new Map(
        watchlistItems.map((inst) => [
          inst.symbol,
          resolveMarketForAssetClass(
            validPreferred,
            availableMarketValues,
            inst.assetClass,
            adapterInfos,
          ),
        ]),
      ),
    [watchlistItems, validPreferred, availableMarketValues, adapterInfos],
  )

  // Connector-switch transition: every row re-resolves and re-subscribes its
  // ticker when the preferred market changes. The rows keep their cached prices
  // (so the list never blanks), so a brief dim→crossfade pulse is the honest cue
  // that the whole list is repricing to a new connector.
  const preferredMarketLabel =
    availableMarkets.find((m) => m.value === validPreferred)?.label ??
    validPreferred
  const [switchPhase, setSwitchPhase] = useState<'switching' | 'live'>('live')
  const prevPreferredRef = useRef(validPreferred)
  useEffect(() => {
    if (prevPreferredRef.current === validPreferred) return
    prevPreferredRef.current = validPreferred
    setSwitchPhase('switching')
    const timer = setTimeout(() => setSwitchPhase('live'), 450)
    return () => clearTimeout(timer)
  }, [validPreferred])

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const priceCacheRef = useRef<Map<string, CachedTicker>>(new Map())

  const rowVirtualizer = useVirtualizer({
    count: watchlistItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 40,
    overscan: 5,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  // Flag to suppress navigation after a drag — checked by each item's onClick.
  const justDraggedRef = useRef(false)

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      justDraggedRef.current = true
      requestAnimationFrame(() => {
        justDraggedRef.current = false
      })

      const { active, over } = event
      if (!over || active.id === over.id) return
      const fromIndex = watchlistItems.findIndex((i) => i.symbol === active.id)
      const toIndex = watchlistItems.findIndex((i) => i.symbol === over.id)
      if (fromIndex !== -1 && toIndex !== -1) {
        reorderSymbols(fromIndex, toIndex)
      }
    },
    [watchlistItems, reorderSymbols],
  )

  // --- Inline rename state ---
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = useCallback((listId: string, currentName: string) => {
    setRenamingId(listId)
    setRenameValue(currentName)
    // focus after render
    setTimeout(() => renameInputRef.current?.focus(), 0)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameList(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }, [renamingId, renameValue, renameList])

  // --- Confirm delete state ---
  const [deletingList, setDeletingList] = useState<{
    id: string
    name: string
  } | null>(null)

  // --- New list dialog ---
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newListName, setNewListName] = useState('')

  const commitCreate = useCallback(() => {
    const name = newListName.trim()
    if (name) {
      createList(name)
    }
    setIsCreateOpen(false)
    setNewListName('')
  }, [newListName, createList])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with list switcher */}
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
        {renamingId === activeList.id ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              commitRename()
            }}
          >
            <input
              ref={renameInputRef}
              className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-xs font-semibold outline-none focus:border-primary"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setRenamingId(null)
              }}
            />
            <Button size="icon-xs" variant="ghost" type="submit">
              <Check className="size-3" />
            </Button>
          </form>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-w-0 flex-1 justify-start gap-1 px-1.5 text-xs font-semibold"
                  />
                }
              >
                <span className="truncate">{activeList.name}</span>
                <span className="text-muted-foreground">
                  ({activeList.symbols.length})
                </span>
                <ChevronDown className="ml-auto size-3 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {lists.map((list) => (
                  <DropdownMenuItem
                    key={list.id}
                    className="flex items-center justify-between"
                    onClick={() => setActiveList(list.id)}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {list.id === activeList.id && (
                        <Check className="size-3 shrink-0" />
                      )}
                      <span className={list.id !== activeList.id ? 'pl-5' : ''}>
                        {list.name}
                      </span>
                      <span className="text-muted-foreground">
                        ({list.symbols.length})
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      {list.id !== DEFAULT_WATCHLIST_ID && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="size-5"
                          onClick={(e) => {
                            e.stopPropagation()
                            startRename(list.id, list.name)
                          }}
                        >
                          <Pencil className="size-2.5" />
                        </Button>
                      )}
                      {list.id !== DEFAULT_WATCHLIST_ID && lists.length > 1 && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="size-5 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeletingList({ id: list.id, name: list.name })
                          }}
                        >
                          <Trash2 className="size-2.5" />
                        </Button>
                      )}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsCreateOpen(true)}>
                  <Plus className="size-3" />
                  {t('watchlist.newWatchlist')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
              <span className="live-dot size-1.5 rounded-full bg-up" />
              {t('connection.live')}
            </span>
            <AddSymbolButton
              listId={activeList.id}
              listSymbols={activeList.symbols}
            />
          </>
        )}
      </div>

      {/* Empty state */}
      <PaneTransition
        className="relative flex min-h-0 flex-1 flex-col"
        phase={switchPhase}
        marketLabel={preferredMarketLabel}
      >
        {watchlistItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <Star className="mb-3 size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t('watchlist.emptyTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('watchlist.emptyDescription')}
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={watchlistItems.map((i) => i.symbol)}
              strategy={verticalListSortingStrategy}
            >
              <div
                ref={scrollContainerRef}
                data-watchlist-rows
                className="flex-1 overflow-auto"
              >
                {(() => {
                  const virtualItems = rowVirtualizer.getVirtualItems()
                  const virtualPaddingTop = virtualItems[0]?.start ?? 0
                  const virtualPaddingBottom =
                    virtualItems.length > 0
                      ? rowVirtualizer.getTotalSize() -
                        (virtualItems[virtualItems.length - 1]?.end ?? 0)
                      : 0
                  return (
                    <>
                      {virtualPaddingTop > 0 && (
                        <div style={{ height: virtualPaddingTop }} />
                      )}
                      {virtualItems.map((virtualRow) => {
                        const inst = watchlistItems[virtualRow.index]
                        return (
                          <SortableWatchlistItem
                            key={inst.symbol}
                            inst={inst}
                            listId={activeList.id}
                            isActive={inst.symbol === activePair?.pairKey}
                            market={
                              marketBySymbol.get(inst.symbol) ?? validPreferred
                            }
                            priceCache={priceCacheRef}
                            justDraggedRef={justDraggedRef}
                            onRemove={removeFromWatchlist}
                          />
                        )
                      })}
                      {virtualPaddingBottom > 0 && (
                        <div style={{ height: virtualPaddingBottom }} />
                      )}
                    </>
                  )
                })()}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </PaneTransition>

      {/* Create watchlist dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false)
            setNewListName('')
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              commitCreate()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('watchlist.newWatchlist')}</DialogTitle>
              <DialogDescription>
                {t('watchlist.createDescription')}
              </DialogDescription>
            </DialogHeader>
            <input
              autoFocus
              className="mt-4 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder={t('watchlist.listNamePlaceholder')}
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false)
                  setNewListName('')
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!newListName.trim()}>
                {t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <AlertDialog
        open={deletingList !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingList(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('watchlist.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('watchlist.deleteDescription', {
                name: deletingList?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingList) {
                  deleteList(deletingList.id)
                  setDeletingList(null)
                }
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// --- Add symbol popover ---

function AddSymbolButton({
  listId,
  listSymbols,
}: {
  listId: string
  listSymbols: Array<string>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const addToWatchlist = useWatchlistsStore((s) => s.addToWatchlist)
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  const listSymbolsSet = useMemo(() => new Set(listSymbols), [listSymbols])

  const handleSelect = useCallback(
    (symbol: string, assetClass?: string) => {
      if (assetClass) {
        setAssetClassMap((prev) => ({ ...prev, [symbol]: assetClass }))
      }
      addToWatchlist(symbol, [listId])
    },
    [addToWatchlist, listId, setAssetClassMap],
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearchValue('')
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={t('watchlist.addSymbol')}
            title={t('watchlist.addSymbol')}
          />
        }
      >
        <Plus className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('watchlist.searchPlaceholder')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-7 pl-7 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <PairSearchResults
            searchValue={searchValue}
            watchedSymbols={listSymbolsSet}
            onSelect={handleSelect}
            maxResults={10}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

// --- Sortable watchlist item ---

type TickDirection = 'up' | 'down' | null

type CachedTicker = {
  price: number
  change24h?: number
}

// Memoized: rows receive stable props, so list-level re-renders (drag state,
// virtualizer scroll, sibling ticker updates) skip rows whose data didn't
// change. Each row still re-renders on its own ticker tick.
const SortableWatchlistItem = memo(function SortableWatchlistItem({
  inst,
  listId,
  isActive,
  market,
  priceCache,
  justDraggedRef,
  onRemove,
}: {
  inst: Instrument
  listId: string
  isActive: boolean
  /** Venue this row prices against — already resolved for its asset class. */
  market: string
  priceCache: React.RefObject<Map<string, CachedTicker>>
  justDraggedRef: React.RefObject<boolean>
  onRemove: (symbol: string, listId: string) => void
}) {
  const navigate = useNavigate()
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    isDragging,
    transform,
    transition,
  } = useSortable({ id: inst.symbol })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const { ticker } = useTickerStream({
    market,
    pairKey: inst.symbol,
  })

  // Derived during render (cache fallback covers re-mounts and market
  // switches) — keeping it out of state avoids a second render per tick.
  const cached = priceCache.current?.get(inst.symbol)
  const displayPrice = ticker?.last ?? cached?.price ?? null
  const displayChange = ticker?.change24h ?? cached?.change24h ?? null
  const [direction, setDirection] = useState<TickDirection>(null)
  const prevPriceRef = useRef<number | null>(displayPrice)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (ticker?.last == null) return

    const prev = prevPriceRef.current
    if (prev != null && ticker.last !== prev) {
      setDirection(ticker.last > prev ? 'up' : 'down')
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setDirection(null), 700)
    }

    prevPriceRef.current = ticker.last
    const prevCached = priceCache.current?.get(inst.symbol)
    priceCache.current?.set(inst.symbol, {
      price: ticker.last,
      ...(ticker.change24h != null
        ? { change24h: ticker.change24h }
        : prevCached?.change24h != null
          ? { change24h: prevCached.change24h }
          : {}),
    })
  }, [ticker?.last, ticker?.change24h, inst.symbol, priceCache])

  useEffect(() => {
    return () => clearTimeout(flashTimerRef.current)
  }, [])

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onRemove(inst.symbol, listId)
    },
    [onRemove, inst.symbol, listId],
  )

  const handleClick = useCallback(() => {
    if (justDraggedRef.current) return
    void navigate({ to: '/pair/$pair', params: { pair: inst.symbol } })
  }, [justDraggedRef, navigate, inst.symbol])

  // Rows are focusable (dnd-kit adds tabIndex/role) but divs have no native
  // key activation — wire Enter/Space to open and arrows to move focus.
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const rows = Array.from(
          e.currentTarget
            .closest('[data-watchlist-rows]')
            ?.querySelectorAll<HTMLElement>('[data-watchlist-row]') ?? [],
        )
        const index = rows.indexOf(e.currentTarget)
        rows[e.key === 'ArrowDown' ? index + 1 : index - 1]?.focus()
      }
    },
    [handleClick],
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      data-watchlist-row
      onKeyDown={handleRowKeyDown}
      className={cn(
        'group flex cursor-pointer items-center gap-1.5 border-b border-border/60 px-2 py-2 transition-colors hover:[background-color:color-mix(in_oklch,var(--primary)_8%,transparent)]',
        isActive &&
          '[background-color:color-mix(in_oklch,var(--primary)_10%,transparent)]',
      )}
      onClick={handleClick}
    >
      {/* Drag handle */}
      <span
        ref={setActivatorNodeRef}
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </span>

      <PairLogo
        base={inst.base}
        quote={inst.quote}
        assetClass={inst.assetClass}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <PairSymbol symbol={inst.symbol} className="text-sm" />
        <p className="truncate text-xs text-muted-foreground">{inst.name}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span
          className={cn(
            'tick-cell inline-flex items-center gap-0.5 font-mono text-xs tabular-nums transition-colors duration-700',
            direction === 'up'
              ? 'tick-up text-up'
              : direction === 'down'
                ? 'tick-down text-down'
                : 'text-muted-foreground',
          )}
        >
          {displayPrice != null ? (
            <>
              {direction === 'up' && <ChevronUp className="size-3 shrink-0" />}
              {direction === 'down' && (
                <ChevronDown className="size-3 shrink-0" />
              )}
              {formatPrice(displayPrice)}
            </>
          ) : (
            <span className="inline-block h-3 w-14 animate-pulse rounded bg-muted" />
          )}
        </span>
        <span className="flex items-center gap-1 text-[9px] uppercase leading-none text-muted-foreground/60">
          {displayChange != null && (
            <span
              className={cn(
                'font-mono tabular-nums',
                displayChange >= 0 ? 'text-up' : 'text-down',
              )}
            >
              {displayChange >= 0 ? '+' : ''}
              {displayChange.toFixed(2)}%
            </span>
          )}
          {market}
        </span>
      </div>
      <Button size="icon-xs" variant="ghost" onClick={handleRemove}>
        <Star className="size-3.5 fill-primary text-primary" />
      </Button>
      <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </div>
  )
})
