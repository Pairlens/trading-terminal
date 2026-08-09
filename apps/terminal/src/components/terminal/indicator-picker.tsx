// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  Check,
  Layers,
  Plus,
  Search,
  SplitSquareVertical,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'
import type {
  IndicatorInstanceInput,
  IndicatorType,
} from '@pairlens/fast-financial-charts/types'

import type {
  IndicatorTemplate,
  IndicatorTemplateEntry,
} from '@/stores/indicator-templates-store'
import type { IndicatorCatalogEntry } from '@/lib/indicators/indicator-catalog'
import { useChartActions } from '@/lib/chart-terminal-context'
import { useIndicatorTemplatesStore } from '@/stores/indicator-templates-store'
import {
  CATEGORY_KEYS,
  CUSTOM_CATEGORY_KEY,
  INDICATOR_CATALOG,
  buildCustomCatalogEntries,
  entryLabel,
  getCustomIndicatorsVersion,
  subscribeToCustomIndicators,
} from '@/lib/indicators/indicator-catalog'

// The catalog moved to `@/lib/indicators/indicator-catalog` so the mobile
// indicators sheet can read it without importing this dialog. Re-exported
// here for callers that still reach through the picker.
export type { IndicatorCatalogEntry }
export { INDICATOR_CATALOG }

type CategoryKey = (typeof CATEGORY_KEYS)[number]
type SidebarSelection = 'all' | 'active' | CategoryKey
type PaneFilter = 'all' | 'overlay' | 'separate'

type IndicatorPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeIndicators: Array<IndicatorInstanceInput>
  onAddIndicator: (indicator: IndicatorInstanceInput) => void
  seriesId: string
}

export function IndicatorPicker({
  open,
  onOpenChange,
  activeIndicators,
  onAddIndicator,
  seriesId,
}: IndicatorPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] =
    useState<SidebarSelection>('all')
  const [paneFilter, setPaneFilter] = useState<PaneFilter>('all')
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // ── Indicator templates ─────────────────────────────────────────────
  const { addIndicator, removeAllIndicators } = useChartActions()
  const templates = useIndicatorTemplatesStore((s) => s.templates)
  const loadTemplates = useIndicatorTemplatesStore((s) => s.load)
  const saveTemplate = useIndicatorTemplatesStore((s) => s.saveTemplate)
  const deleteTemplate = useIndicatorTemplatesStore((s) => s.deleteTemplate)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [pendingTemplate, setPendingTemplate] =
    useState<Array<IndicatorTemplateEntry> | null>(null)

  useEffect(() => {
    if (open) loadTemplates()
  }, [open, loadTemplates])

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setSearch('')
        setSelectedCategory('all')
        setPaneFilter('all')
        setFocusedIndex(-1)
        setSavingTemplate(false)
        setTemplateName('')
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const handleSaveTemplate = useCallback(() => {
    const name = templateName.trim()
    if (!name || activeIndicators.length === 0) return
    saveTemplate(
      name,
      activeIndicators.map((entry) => ({
        type: entry.type,
        params: entry.params ?? {},
        pane: entry.pane,
      })),
    )
    setTemplateName('')
    setSavingTemplate(false)
  }, [templateName, activeIndicators, saveTemplate])

  const handleApplyTemplate = useCallback(
    (template: IndicatorTemplate) => {
      removeAllIndicators()
      setPendingTemplate(template.indicators)
      onOpenChange(false)
    },
    [removeAllIndicators, onOpenChange],
  )

  // Deferred template apply: addIndicator toggles off entries that match the
  // pre-clear indicator list (its closure over activeIndicators is one render
  // behind), so wait until the cleared list has propagated before adding.
  useEffect(() => {
    if (!pendingTemplate) return
    if (activeIndicators.length > 0) return
    setPendingTemplate(null)
    for (const entry of pendingTemplate) {
      addIndicator({
        type: entry.type as IndicatorType,
        seriesId,
        params: entry.params,
        pane: entry.pane,
      })
    }
  }, [pendingTemplate, activeIndicators, addIndicator, seriesId])

  // Auto-switch away from "active" when all indicators are removed
  useEffect(() => {
    if (selectedCategory === 'active' && activeIndicators.length === 0) {
      setSelectedCategory('all')
    }
  }, [selectedCategory, activeIndicators.length])

  const activeTypeSet = useMemo(
    () => new Set(activeIndicators.map((i) => i.type)),
    [activeIndicators],
  )

  // Custom (script-defined) indicators — reactive on registry changes only
  // (plugin activation / script saves), never on market data ticks.
  const customIndicatorsVersion = useSyncExternalStore(
    subscribeToCustomIndicators,
    getCustomIndicatorsVersion,
    getCustomIndicatorsVersion,
  )
  const customEntries = useMemo(
    () => buildCustomCatalogEntries(),

    [customIndicatorsVersion],
  )
  const catalog = useMemo(
    () =>
      customEntries.length === 0
        ? INDICATOR_CATALOG
        : [...INDICATOR_CATALOG, ...customEntries],
    [customEntries],
  )

  // Search matcher reused across filter stages
  const matchesSearch = useCallback(
    (e: IndicatorCatalogEntry, q: string) =>
      !q ||
      entryLabel(e, t).toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q),
    [t],
  )

  // Filter pipeline: category → search → pane
  const { filtered, grouped, showGrouped, categoryCounts, paneFilterCounts } =
    useMemo(() => {
      const q = search.toLowerCase().trim()

      // Step 1: category filter
      let byCat: Array<IndicatorCatalogEntry>
      if (selectedCategory === 'all') {
        byCat = catalog
      } else if (selectedCategory === 'active') {
        byCat = catalog.filter((e) => activeTypeSet.has(e.type))
      } else {
        byCat = catalog.filter((e) => e.categoryKey === selectedCategory)
      }

      // Step 2: search — match against translated label and type code
      const bySearch = q ? byCat.filter((e) => matchesSearch(e, q)) : byCat

      // Compute pane filter counts from the search-filtered set
      const paneCounts = {
        all: bySearch.length,
        overlay: bySearch.filter((e) => e.pane === 'overlay').length,
        separate: bySearch.filter((e) => e.pane === 'separate').length,
      }

      // Step 3: pane filter
      const byPane =
        paneFilter === 'all'
          ? bySearch
          : bySearch.filter((e) => e.pane === paneFilter)

      // Group by category when viewing "all" with no search
      const groupedView = selectedCategory === 'all' && !q
      const groupedItems = groupedView
        ? CATEGORY_KEYS.map((catKey) => ({
            categoryKey: catKey,
            items: byPane.filter((e) => e.categoryKey === catKey),
          })).filter((g) => g.items.length > 0)
        : []

      // Counts per category (for sidebar badges) — respects search filter
      const searchFiltered = q
        ? catalog.filter((e) => matchesSearch(e, q))
        : catalog
      const catCounts: Record<string, number> = {}
      for (const catKey of CATEGORY_KEYS) {
        catCounts[catKey] = searchFiltered.filter(
          (e) => e.categoryKey === catKey,
        ).length
      }

      return {
        filtered: byPane,
        grouped: groupedItems,
        showGrouped: groupedView,
        categoryCounts: catCounts,
        paneFilterCounts: paneCounts,
      }
    }, [
      selectedCategory,
      paneFilter,
      search,
      activeTypeSet,
      matchesSearch,
      catalog,
    ])

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    if (showGrouped) {
      return grouped.flatMap((g) => g.items)
    }
    return filtered
  }, [showGrouped, grouped, filtered])

  const handleSelect = useCallback(
    (entry: IndicatorCatalogEntry) => {
      onAddIndicator({
        type: entry.type,
        seriesId,
        params: entry.defaultParams,
        pane: entry.pane,
      })
      onOpenChange(false)
    },
    [onAddIndicator, onOpenChange, seriesId],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, flatList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault()
        const entry = flatList[focusedIndex]
        if (entry) handleSelect(entry)
      }
    },
    [flatList, focusedIndex, handleSelect],
  )

  // Scroll focused item into view
  const scrollIntoView = useCallback((index: number) => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll('[data-indicator-row]')
    items[index]?.scrollIntoView({ block: 'nearest' })
  }, [])

  // Update scroll on focus change
  const prevFocusedIndex = useRef(focusedIndex)
  if (prevFocusedIndex.current !== focusedIndex) {
    prevFocusedIndex.current = focusedIndex
    // Use microtask to ensure DOM is updated
    queueMicrotask(() => scrollIntoView(focusedIndex))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl min-h-[420px] max-h-[min(560px,calc(100vh-4rem))] p-0 gap-0 flex flex-col overflow-hidden"
      >
        <DialogTitle className="sr-only">{t('indicators.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('indicators.description')}
        </DialogDescription>

        {/* Search bar */}
        <div className="px-3 py-2.5 border-b" onKeyDown={handleKeyDown}>
          <div className="flex items-center gap-2">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              placeholder={t('indicators.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setFocusedIndex(-1)
              }}
              autoFocus
              className="bg-transparent text-sm outline-none placeholder:text-muted-foreground flex-1"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  searchRef.current?.focus()
                }}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {t('indicators.picker.clear')}
              </button>
            )}
          </div>
        </div>

        {/* Two-panel body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="w-44 shrink-0 border-r overflow-y-auto py-2 px-1.5 hidden sm:flex flex-col gap-0.5">
            {/* Templates */}
            <div className="px-2 pb-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('indicators.templates.heading')}
            </div>

            {templates.map((template) => (
              <div
                key={template.id}
                className="group/template flex items-center gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => handleApplyTemplate(template)}
                  title={t('indicators.templates.applyTitle')}
                  className="min-w-0 flex-1 text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <span className="truncate flex-1">{template.name}</span>
                  <span className="text-muted-foreground ml-auto">
                    {template.indicators.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(template.id)}
                  aria-label={t('indicators.templates.delete')}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/template:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}

            {savingTemplate ? (
              <div className="flex items-center gap-1 px-2 py-1">
                <input
                  autoFocus
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      handleSaveTemplate()
                    } else if (e.key === 'Escape') {
                      setSavingTemplate(false)
                      setTemplateName('')
                    }
                  }}
                  placeholder={t('indicators.templates.namePlaceholder')}
                  className="min-w-0 flex-1 bg-transparent border-b py-0.5 text-xs outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim()}
                  aria-label={t('indicators.templates.save')}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Check className="size-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSavingTemplate(true)}
                disabled={activeIndicators.length === 0}
                className="w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <Plus className="size-3 shrink-0" />
                <span className="truncate">
                  {t('indicators.templates.saveCurrent')}
                </span>
              </button>
            )}

            <div className="border-b mx-1 my-1.5" />

            <SidebarButton
              active={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
            >
              {t('indicators.picker.allIndicators')}
              <span className="text-muted-foreground ml-auto">
                {Object.values(categoryCounts).reduce((a, b) => a + b, 0)}
              </span>
            </SidebarButton>

            {activeIndicators.length > 0 && (
              <SidebarButton
                active={selectedCategory === 'active'}
                onClick={() => setSelectedCategory('active')}
              >
                {t('indicators.activeHeading')}
                <span className="text-muted-foreground ml-auto">
                  {activeIndicators.length}
                </span>
              </SidebarButton>
            )}

            <div className="border-b mx-1 my-1.5" />

            {CATEGORY_KEYS.filter(
              (catKey) =>
                catKey !== CUSTOM_CATEGORY_KEY || customEntries.length > 0,
            ).map((catKey) => (
              <SidebarButton
                key={catKey}
                active={selectedCategory === catKey}
                onClick={() => setSelectedCategory(catKey)}
              >
                {t(catKey)}
                <span className="text-muted-foreground ml-auto">
                  {categoryCounts[catKey]}
                </span>
              </SidebarButton>
            ))}

            {/* Clear all — pinned to the bottom of the sidebar */}
            <div className="mt-auto pt-1.5">
              <div className="border-b mx-1 mb-1.5" />
              <button
                type="button"
                onClick={() => removeAllIndicators()}
                disabled={activeIndicators.length === 0}
                className="w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <Trash2 className="size-3 shrink-0" />
                <span className="truncate">
                  {t('indicators.picker.clearAll')}
                </span>
              </button>
            </div>
          </div>

          {/* Main area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Filter tabs */}
            <div className="px-3 py-2 border-b flex items-center gap-1.5">
              <FilterTab
                active={paneFilter === 'all'}
                onClick={() => setPaneFilter('all')}
              >
                {t('indicators.picker.filterAll')}
                <span className="text-muted-foreground ml-1">
                  {paneFilterCounts.all}
                </span>
              </FilterTab>
              <FilterTab
                active={paneFilter === 'overlay'}
                onClick={() => setPaneFilter('overlay')}
              >
                <Layers className="size-3" />
                {t('indicators.picker.filterOverlay')}
                <span className="text-muted-foreground ml-1">
                  {paneFilterCounts.overlay}
                </span>
              </FilterTab>
              <FilterTab
                active={paneFilter === 'separate'}
                onClick={() => setPaneFilter('separate')}
              >
                <SplitSquareVertical className="size-3" />
                {t('indicators.picker.filterSeparate')}
                <span className="text-muted-foreground ml-1">
                  {paneFilterCounts.separate}
                </span>
              </FilterTab>
            </div>

            {/* Indicator list */}
            <ScrollArea className="min-h-0 flex-1">
              <div ref={listRef}>
                {flatList.length === 0 && (
                  <div className="text-muted-foreground text-sm text-center py-8">
                    {t('indicators.noResults')}
                  </div>
                )}

                {showGrouped
                  ? grouped.map((group) => (
                      <div key={group.categoryKey}>
                        <div className="sticky top-0 bg-popover/95 backdrop-blur-sm px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          {t(group.categoryKey)}
                        </div>
                        {group.items.map((entry) => {
                          const globalIdx = flatList.indexOf(entry)
                          return (
                            <IndicatorRow
                              key={entry.type}
                              entry={entry}
                              label={entryLabel(entry, t)}
                              isActive={activeTypeSet.has(entry.type)}
                              isFocused={globalIdx === focusedIndex}
                              onSelect={() => handleSelect(entry)}
                              onHover={() => setFocusedIndex(globalIdx)}
                            />
                          )
                        })}
                      </div>
                    ))
                  : filtered.map((entry) => {
                      const idx = flatList.indexOf(entry)
                      return (
                        <IndicatorRow
                          key={entry.type}
                          entry={entry}
                          label={entryLabel(entry, t)}
                          isActive={activeTypeSet.has(entry.type)}
                          isFocused={idx === focusedIndex}
                          onSelect={() => handleSelect(entry)}
                          onHover={() => setFocusedIndex(idx)}
                        />
                      )
                    })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SidebarButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${
        active
          ? 'bg-muted text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  )
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      {children}
    </button>
  )
}

function IndicatorRow({
  entry,
  label,
  isActive,
  isFocused,
  onSelect,
  onHover,
}: {
  entry: IndicatorCatalogEntry
  label: string
  isActive: boolean
  isFocused: boolean
  onSelect: () => void
  onHover: () => void
}) {
  return (
    <button
      type="button"
      data-indicator-row
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${
        isFocused ? 'bg-muted/80' : 'hover:bg-muted/50'
      }`}
    >
      {isActive ? (
        <Check className="text-primary size-4 shrink-0" />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span className="truncate flex-1">{label}</span>
      <span className="text-muted-foreground text-xs font-mono shrink-0">
        {entry.type.startsWith('custom:')
          ? (entry.type.split(':').pop() ?? entry.type)
          : entry.type}
      </span>
    </button>
  )
}
