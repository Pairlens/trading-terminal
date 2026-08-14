// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'
import { Monitor, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import type { PaneDefinition, WorkspaceConfig } from '@/lib/layout/types'
import { PANE_CATEGORIES } from '@/lib/layout/pane-categories'
import { getPaneIcon } from '@/lib/layout/pane-icons'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { isStandalone } from '@/lib/platform'

type AddPaneDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTypes: Set<string>
  workspace?: WorkspaceConfig
  onSelectPane: (type: string) => void
}

function isSingletonRelaxed(
  def: PaneDefinition,
  workspace?: WorkspaceConfig,
): boolean {
  if (!def.singleton) return true
  const hasVars = workspace?.variables && workspace.variables.length > 0
  const requiresPair = def.requires?.includes('workspace:active-pair')
  return Boolean(hasVars && requiresPair)
}

export function AddPaneDialog({
  open,
  onOpenChange,
  existingTypes,
  workspace,
  onSelectPane,
}: AddPaneDialogProps) {
  const { t } = useTranslation()
  const registry = usePaneRegistry()
  const paneDefinitions = registry.getDefinitions()

  const [activeCategory, setActiveCategory] = useState<string>(
    PANE_CATEGORIES[0]!.id,
  )
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  // Reset search when dialog opens
  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  // Categories that have at least one registered pane
  const populatedCategories = useMemo(() => {
    const panesByCat = new Map<string, Array<[string, PaneDefinition]>>()
    for (const [type, def] of Object.entries(paneDefinitions)) {
      if (!def.category) continue
      let arr = panesByCat.get(def.category)
      if (!arr) {
        arr = []
        panesByCat.set(def.category, arr)
      }
      arr.push([type, def])
    }
    return PANE_CATEGORIES.filter((cat) => panesByCat.has(cat.id)).map(
      (cat) => ({
        ...cat,
        panes: panesByCat.get(cat.id)!,
      }),
    )
  }, [paneDefinitions])

  // Filtered panes (search applies across all categories)
  const isSearching = search.trim().length > 0
  const panesByCategory = useMemo(() => {
    if (!isSearching) return populatedCategories
    const q = search.toLowerCase().trim()
    return populatedCategories
      .map((cat) => ({
        ...cat,
        panes: cat.panes.filter(
          ([type, def]) =>
            t(def.labelKey).toLowerCase().includes(q) ||
            type.toLowerCase().includes(q) ||
            (def.descriptionKey &&
              t(def.descriptionKey).toLowerCase().includes(q)),
        ),
      }))
      .filter((cat) => cat.panes.length > 0)
  }, [populatedCategories, isSearching, search, t])

  // IntersectionObserver to track which category section is visible
  useEffect(() => {
    if (!open) return

    const main = mainRef.current
    if (!main) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-category')
            if (id) setActiveCategory(id)
          }
        }
      },
      { root: main, rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    )

    const sections = main.querySelectorAll('[data-category]')
    sections.forEach((s) => observer.observe(s))

    return () => observer.disconnect()
  }, [open])

  const handleCategoryClick = (id: string) => {
    setActiveCategory(id)
    const el = mainRef.current?.querySelector(`[data-category="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSelectPane = (type: string) => {
    onSelectPane(type)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(560px,calc(100vh-4rem))] w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">{t('layout.addPane')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('addPaneDialog.description')}
        </DialogDescription>

        {/* Search bar */}
        <div className="shrink-0 border-b px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              placeholder={t('layout.searchPanes')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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

        {/* Content area */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar — hidden while searching */}
          <nav
            className={`w-[180px] shrink-0 overflow-y-auto border-r px-2 py-3 ${isSearching ? 'hidden' : ''}`}
          >
            <ul className="space-y-0.5">
              {populatedCategories.map((cat) => {
                const Icon = cat.icon
                const isActive = activeCategory === cat.id
                return (
                  <li key={cat.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      }`}
                      onClick={() => handleCategoryClick(cat.id)}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      {t(cat.labelKey)}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Main pane list */}
          <div ref={mainRef} className="flex-1 overflow-y-auto px-4 py-4">
            {panesByCategory.length === 0 && (
              <div className="text-muted-foreground text-sm text-center py-8">
                {t('common.noResults')}
              </div>
            )}
            {panesByCategory.map((cat) => (
              <section
                key={cat.id}
                data-category={cat.id}
                className="mb-6 last:mb-0"
              >
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(cat.labelKey)}
                </h3>
                <div className="space-y-1">
                  {cat.panes.map(([type, def]) => {
                    const Icon = getPaneIcon(def.icon)
                    // Offered, not hidden: a browser user should see what the
                    // desktop app adds, which is the same argument the venue
                    // list makes. It just cannot be picked here.
                    const isDesktopOnly = Boolean(
                      def.requiresDesktop && !isStandalone,
                    )
                    const isAdded = Boolean(
                      def.singleton &&
                      existingTypes.has(type) &&
                      !isSingletonRelaxed(def, workspace),
                    )
                    const isDisabled = isAdded || isDesktopOnly

                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={isDisabled}
                        className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                          isDisabled
                            ? 'cursor-default opacity-40'
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => !isDisabled && handleSelectPane(type)}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {t(def.labelKey)}
                            </span>
                            {isAdded && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {t('addPaneDialog.added')}
                              </span>
                            )}
                            {isDesktopOnly && (
                              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                <Monitor className="size-2.5" />
                                {t('addPaneDialog.desktopOnly')}
                              </span>
                            )}
                            {def.requiredAccessLevel && (
                              <Badge variant="secondary" className="text-[9px]">
                                {def.requiredAccessLevel}
                              </Badge>
                            )}
                          </div>
                          {def.descriptionKey && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t(def.descriptionKey)}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
