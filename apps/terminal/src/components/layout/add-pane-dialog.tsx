// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Picking a panel out of ninety-three.
 *
 * The version this replaced was a scroll-spy list: a name, an icon and a line
 * of description, with the category rail moving as you scrolled past it. It
 * worked if you already knew what a Funding Belt was. If you did not, the only
 * way to find out was to add it, look at it, and close it again — which is a
 * strange thing to ask of a picker whose whole job is to answer "what is
 * this".
 *
 * So the dialog is three columns now: filter, list, and what the thing looks
 * like. The right side draws the panel as the board would draw it (see
 * `pane-preview.tsx` for why a schematic rather than a screenshot), says what
 * it needs before it can show anything, and names the plugin it came from. The
 * list is keyboard-first — ↑↓ to browse, Enter to add — and a click still adds
 * in one action, so nobody who already knew what they wanted got slower.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleDot,
  Crown,
  LayoutGrid,
  Link2,
  Monitor,
  Plus,
  Puzzle,
  Search,
  Wallet,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Kbd } from '@pairlens/ui/components/ui/kbd'

import { PanePreview, resolvePreviewArchetype } from './pane-preview'
import type { PaneDefinition, WorkspaceConfig } from '@/lib/layout/types'
import type { PanePickerEntry, PaneRequirement } from '@/lib/layout/pane-picker'
import { PANE_CATEGORIES } from '@/lib/layout/pane-categories'
import { getPaneIcon } from '@/lib/layout/pane-icons'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import {
  paneRequirements,
  rankPanes,
  requirementKey,
} from '@/lib/layout/pane-picker'
import { track } from '@/lib/analytics-events'
import { usePluginManager } from '@/lib/pairlens-provider'
import { useLocalized } from '@/lib/plugin-text'
import { isStandalone } from '@/lib/platform'

type AddPaneDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingTypes: Set<string>
  workspace?: WorkspaceConfig
  onSelectPane: (type: string) => void
}

const ALL = '__all__'

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
  const { localizedText, pluginTitle } = useLocalized()
  const registry = usePaneRegistry()
  const pluginManager = usePluginManager()
  const paneDefinitions = registry.getDefinitions()

  const [category, setCategory] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  /**
   * Keyboard navigation scrolls the list, scrolling fires `mouseenter` under a
   * resting pointer, and the row the pointer happens to sit on steals the
   * selection back. Ignore hover for a moment after every arrow press.
   */
  const keyboardAt = useRef(0)

  useEffect(() => {
    if (open) {
      setSearch('')
      setCategory(ALL)
      setSelected(null)
    }
  }, [open])

  // Panel display names come from the catalog for ours and from the manifest
  // for everyone else's — `t()` on a key nobody registered renders the key.
  const entries = useMemo<Array<PanePickerEntry>>(() => {
    const sourceName = (type: string): string => {
      const pluginId = registry.getPluginForPane(type)
      if (!pluginId) return ''
      const instance = pluginManager
        .getInstalledPlugins()
        .find((p) => p.manifest.id === pluginId)
      return instance ? pluginTitle(instance.manifest) : pluginId
    }

    const byCategory = new Map<string, Array<PanePickerEntry>>()
    for (const [type, def] of Object.entries(paneDefinitions)) {
      if (!def.category) continue
      const label = t(def.labelKey, {
        defaultValue: localizedText(def.label) ?? type,
      })
      const description = def.descriptionKey
        ? t(def.descriptionKey, {
            defaultValue: localizedText(def.description) ?? '',
          })
        : (localizedText(def.description) ?? '')
      const cat = PANE_CATEGORIES.find((c) => c.id === def.category)
      const entry: PanePickerEntry = {
        type,
        def,
        label,
        description,
        categoryLabel: cat ? t(cat.labelKey) : def.category,
        sourceLabel: sourceName(type),
      }
      const list = byCategory.get(def.category)
      if (list) list.push(entry)
      else byCategory.set(def.category, [entry])
    }

    // Authored order: categories as declared, panels as the manifest lists them.
    const ordered: Array<PanePickerEntry> = []
    for (const cat of PANE_CATEGORIES) {
      ordered.push(...(byCategory.get(cat.id) ?? []))
    }
    return ordered
  }, [paneDefinitions, registry, pluginManager, pluginTitle, localizedText, t])

  const searched = useMemo(() => rankPanes(entries, search), [entries, search])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of searched) {
      const id = entry.def.category ?? ''
      map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [searched])

  // A filter that hides every result is a dead end, so a category the search
  // emptied stops applying rather than showing nothing.
  const effectiveCategory =
    category !== ALL && (counts.get(category) ?? 0) === 0 ? ALL : category

  const visible = useMemo(
    () =>
      effectiveCategory === ALL
        ? searched
        : searched.filter((e) => e.def.category === effectiveCategory),
    [searched, effectiveCategory],
  )

  const current = visible.find((e) => e.type === selected) ?? visible[0] ?? null

  // Keep the highlighted row on screen while arrowing through the list.
  useEffect(() => {
    if (!current) return
    const node = listRef.current?.querySelector(
      `[data-pane-type="${CSS.escape(current.type)}"]`,
    )
    node?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const isBlocked = useCallback(
    (entry: PanePickerEntry) => {
      const desktopOnly = Boolean(entry.def.requiresDesktop && !isStandalone)
      const added = Boolean(
        entry.def.singleton &&
        existingTypes.has(entry.type) &&
        !isSingletonRelaxed(entry.def, workspace),
      )
      return { desktopOnly, added, blocked: desktopOnly || added }
    },
    [existingTypes, workspace],
  )

  const commit = useCallback(
    (entry: PanePickerEntry | null) => {
      if (!entry || isBlocked(entry).blocked) return
      track('panel_picker_committed', {
        pane_type: entry.type,
        searched: search.trim().length > 0,
        rank: visible.indexOf(entry),
      })
      onSelectPane(entry.type)
      onOpenChange(false)
    },
    [isBlocked, onSelectPane, onOpenChange, search, visible],
  )

  const move = useCallback(
    (delta: number) => {
      if (visible.length === 0) return
      keyboardAt.current = Date.now()
      const at = current ? visible.indexOf(current) : -1
      const next = Math.min(Math.max(at + delta, 0), visible.length - 1)
      setSelected(visible[next]!.type)
    },
    [current, visible],
  )

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commit(current)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[min(620px,calc(100vh-4rem))] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">{t('layout.addPane')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('addPaneDialog.description')}
        </DialogDescription>

        <div className="flex shrink-0 items-center gap-2 border-b py-3 pr-11 pl-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            placeholder={t('layout.searchPanes')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              aria-label={t('indicators.picker.clear')}
              onClick={() => {
                setSearch('')
                searchRef.current?.focus()
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {t('addPaneDialog.count', { count: visible.length })}
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[164px_296px_1fr]">
          <nav className="min-h-0 overflow-y-auto border-r px-2 py-3">
            <ul className="space-y-0.5">
              <CategoryButton
                label={t('addPaneDialog.all')}
                icon={LayoutGrid}
                count={searched.length}
                active={effectiveCategory === ALL}
                onClick={() => setCategory(ALL)}
              />
              {PANE_CATEGORIES.map((cat) => {
                const count = counts.get(cat.id) ?? 0
                if (count === 0 && search.trim()) return null
                return (
                  <CategoryButton
                    key={cat.id}
                    label={t(cat.labelKey)}
                    icon={cat.icon}
                    count={count}
                    active={effectiveCategory === cat.id}
                    onClick={() => setCategory(cat.id)}
                  />
                )
              })}
            </ul>
          </nav>

          {visible.length === 0 && (
            <div className="col-span-2 flex flex-col items-center justify-center gap-1.5 px-10 text-center">
              <p className="text-sm font-medium">{t('common.noResults')}</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {t('addPaneDialog.noMatchHint')}
              </p>
            </div>
          )}

          <div
            ref={listRef}
            className={cn(
              'min-h-0 overflow-y-auto border-r p-2',
              visible.length === 0 && 'hidden',
            )}
          >
            {visible.map((entry) => {
              const Icon = getPaneIcon(entry.def.icon)
              const state = isBlocked(entry)
              const active = current?.type === entry.type
              return (
                <button
                  key={entry.type}
                  type="button"
                  data-pane-type={entry.type}
                  disabled={state.blocked}
                  tabIndex={-1}
                  onMouseEnter={() => {
                    if (Date.now() - keyboardAt.current < 250) return
                    setSelected(entry.type)
                  }}
                  onFocus={() => setSelected(entry.type)}
                  onClick={() => commit(entry)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    active && 'bg-muted',
                    state.blocked
                      ? 'cursor-default opacity-45'
                      : 'hover:bg-muted',
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {entry.label}
                  </span>
                  {state.added && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground">
                      {t('addPaneDialog.added')}
                    </span>
                  )}
                  {state.desktopOnly && (
                    <Monitor
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-label={t('addPaneDialog.desktopOnly')}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {current && (
            <PaneDetail
              key={current.type}
              entry={current}
              state={isBlocked(current)}
              onAdd={() => commit(current)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CategoryButton({
  label,
  icon: Icon,
  count,
  active,
  onClick,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-xs transition-colors',
          active
            ? 'bg-muted font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-60">
          {count}
        </span>
      </button>
    </li>
  )
}

const REQUIREMENT_ICON: Record<PaneRequirement['kind'], typeof Wallet> = {
  pair: Link2,
  wallet: Wallet,
  desktop: Monitor,
  singleton: CircleDot,
  access: Crown,
  capability: Puzzle,
}

function PaneDetail({
  entry,
  state,
  onAdd,
}: {
  entry: PanePickerEntry
  state: { desktopOnly: boolean; added: boolean; blocked: boolean }
  onAdd: () => void
}) {
  const { t } = useTranslation()
  const Icon = getPaneIcon(entry.def.icon)
  const requirements = useMemo(() => paneRequirements(entry.def), [entry.def])
  const archetype = resolvePreviewArchetype(entry.def)

  return (
    <div className="flex min-h-0 flex-col">
      <PanePreview
        archetype={archetype}
        title={entry.label}
        className="m-3 mb-0 h-[260px] shrink-0"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
              {entry.label}
            </h3>
            {entry.def.requiredAccessLevel && (
              <Badge variant="secondary" className="text-[9px]">
                {entry.def.requiredAccessLevel}
              </Badge>
            )}
          </div>
          {entry.description && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {entry.description}
            </p>
          )}
        </div>

        {requirements.length > 0 && (
          <div>
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
              {t('addPaneDialog.needs.title')}
            </p>
            <ul className="mt-1.5 space-y-1">
              {requirements.map((req) => {
                const ReqIcon = REQUIREMENT_ICON[req.kind]
                return (
                  <li
                    key={req.kind + ('capability' in req ? req.capability : '')}
                    className="flex items-start gap-2 text-[11.5px] leading-snug text-muted-foreground"
                  >
                    <ReqIcon className="mt-px size-3 shrink-0 opacity-70" />
                    <span>
                      {t(requirementKey(req), {
                        level: req.kind === 'access' ? req.level : undefined,
                        capability:
                          req.kind === 'capability'
                            ? req.capability
                            : undefined,
                      })}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {entry.sourceLabel && (
          <p className="text-[11px] text-muted-foreground">
            {t('addPaneDialog.source', { plugin: entry.sourceLabel })}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-2.5">
        <span className="min-w-0 truncate text-[10.5px] text-muted-foreground">
          {state.added
            ? t('addPaneDialog.alreadyOnBoard')
            : state.desktopOnly
              ? t('addPaneDialog.desktopOnlyDetail')
              : t('addPaneDialog.sampleData')}
        </span>
        <Button
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          disabled={state.blocked}
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
          {t('addPaneDialog.add')}
          <Kbd className="ml-0.5">↵</Kbd>
        </Button>
      </div>
    </div>
  )
}
