// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'

import type {
  SdkCompletion,
  SdkReferenceGroup,
} from '@/lib/python/sdk-completions'
import {
  SDK_REFERENCE_GROUPS,
  sdkInsertSnippet,
  sdkQualifiedName,
} from '@/lib/python/sdk-completions'

type SdkReferenceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Insert a snippet at the editor cursor. Optional — hide the insert
   * affordance when absent. */
  onInsert?: (snippet: string) => void
}

/** A group with the entries that survived the search, name matches first. */
type GroupResult = {
  group: SdkReferenceGroup
  entries: Array<SdkCompletion>
}

/** Everything the panel can show, precomputed once: no work per keystroke. */
const ALL_RESULTS: Array<GroupResult> = SDK_REFERENCE_GROUPS.map((group) => ({
  group,
  entries: group.entries,
}))

/** Lowercased haystacks, built once — the search reads names then docs. */
const SEARCH_INDEX = new Map<SdkCompletion, { name: string; doc: string }>()
for (const group of SDK_REFERENCE_GROUPS) {
  for (const entry of group.entries) {
    SEARCH_INDEX.set(entry, {
      name: sdkQualifiedName(group, entry).toLowerCase(),
      doc: `${entry.detail ?? ''} ${entry.info ?? ''}`.toLowerCase(),
    })
  }
}

/**
 * Filter every group by `query`. Entries whose name matches come before ones
 * that only matched their docs, so typing "ema" lands on `ta.ema` rather than
 * on the six functions that mention an EMA in prose.
 */
function search(query: string): Array<GroupResult> {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_RESULTS
  const results: Array<GroupResult> = []
  for (const { group, entries } of ALL_RESULTS) {
    const byName: Array<SdkCompletion> = []
    const byDoc: Array<SdkCompletion> = []
    for (const entry of entries) {
      const index = SEARCH_INDEX.get(entry)
      if (!index) continue
      if (index.name.includes(q)) byName.push(entry)
      else if (index.doc.includes(q)) byDoc.push(entry)
    }
    if (byName.length + byDoc.length > 0) {
      results.push({ group, entries: [...byName, ...byDoc] })
    }
  }
  return results
}

/** True while the keystroke belongs to a field the user is typing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA'
  )
}

/**
 * The browsable `pairlens` SDK reference: a search box over every documented
 * symbol, a rail of groups down the side, and (when the host passes `onInsert`)
 * a ready-to-paste call for each entry.
 */
export function SdkReferenceDialog({
  open,
  onOpenChange,
  onInsert,
}: SdkReferenceDialogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string>('all')
  const searchRef = useRef<HTMLInputElement>(null)

  // Typing stays responsive on a ~110-entry list: the filter runs against the
  // deferred value while the input paints immediately.
  const deferredQuery = useDeferredValue(query)
  const results = useMemo(() => search(deferredQuery), [deferredQuery])

  const visible = useMemo(
    () =>
      selected === 'all'
        ? results
        : results.filter((result) => result.group.id === selected),
    [results, selected],
  )

  const counts = useMemo(() => {
    const byGroup = new Map<string, number>()
    let total = 0
    for (const result of results) {
      byGroup.set(result.group.id, result.entries.length)
      total += result.entries.length
    }
    return { byGroup, total }
  }, [results])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setQuery('')
        setSelected('all')
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  // `/` and ⌘F/Ctrl+F jump to the search box while the dialog is open.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      const find = event.key === 'f' && (event.metaKey || event.ctrlKey)
      const slash = event.key === '/' && !isTypingTarget(event.target)
      if (!find && !slash) return
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const groupLabel = useCallback(
    (group: SdkReferenceGroup) =>
      group.labelKey ? t(group.labelKey) : (group.name ?? group.id),
    [t],
  )

  const namespaceGroups = useMemo(
    () => SDK_REFERENCE_GROUPS.filter((group) => group.kind !== 'ta'),
    [],
  )
  const taGroups = useMemo(
    () => SDK_REFERENCE_GROUPS.filter((group) => group.kind === 'ta'),
    [],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl h-[min(680px,calc(100vh-4rem))] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-base">
            {t('indicatorsPage.sdkRefTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('indicatorsPage.sdkRefDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 focus-within:border-ring">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('indicatorsPage.sdkRefSearchPlaceholder')}
              aria-label={t('indicatorsPage.sdkRefSearchPlaceholder')}
              className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {counts.total}
            </span>
          </div>
        </div>

        {/* Rail + results */}
        <div className="flex min-h-0 flex-1 border-t">
          <div className="hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-1.5 py-2 sm:flex">
            <RailButton
              active={selected === 'all'}
              onClick={() => setSelected('all')}
              count={counts.total}
            >
              {t('indicatorsPage.sdkRefAll')}
            </RailButton>

            <RailHeading>{t('indicatorsPage.sdkRefApi')}</RailHeading>
            {namespaceGroups.map((group) => (
              <RailButton
                key={group.id}
                active={selected === group.id}
                onClick={() => setSelected(group.id)}
                count={counts.byGroup.get(group.id) ?? 0}
                mono
              >
                {groupLabel(group)}
              </RailButton>
            ))}

            <RailHeading>{t('indicatorsPage.sdkRefTaHeading')}</RailHeading>
            {taGroups.map((group) => (
              <RailButton
                key={group.id}
                active={selected === group.id}
                onClick={() => setSelected(group.id)}
                count={counts.byGroup.get(group.id) ?? 0}
              >
                {groupLabel(group)}
              </RailButton>
            ))}
          </div>

          <ScrollArea className="flex-1">
            {visible.length === 0 ? (
              <div className="text-muted-foreground px-6 py-12 text-center text-sm">
                <p>
                  {t('indicatorsPage.sdkRefEmpty', { query: query.trim() })}
                </p>
                <p className="mt-1 text-xs">
                  {t('indicatorsPage.sdkRefEmptyHint')}
                </p>
              </div>
            ) : (
              visible.map(({ group, entries }) => (
                <section key={group.id}>
                  <h3
                    className={cn(
                      'bg-background/95 text-muted-foreground sticky top-0 z-10 px-4 py-1.5 text-[11px] font-medium tracking-wider uppercase backdrop-blur-sm',
                      group.kind !== 'ta' && 'font-mono normal-case',
                    )}
                  >
                    {groupLabel(group)}
                  </h3>
                  <ul>
                    {entries.map((entry) => (
                      <ReferenceRow
                        key={`${group.id}.${entry.label}`}
                        group={group}
                        entry={entry}
                        onInsert={onInsert}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground mt-2 px-2 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wider uppercase">
      {children}
    </div>
  )
}

function RailButton({
  active,
  count,
  mono,
  onClick,
  children,
}: {
  active: boolean
  count: number
  mono?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
        active
          ? 'bg-muted text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        count === 0 && !active && 'opacity-50',
      )}
    >
      <span className={cn('flex-1 truncate', mono && 'font-mono')}>
        {children}
      </span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

function ReferenceRow({
  group,
  entry,
  onInsert,
}: {
  group: SdkReferenceGroup
  entry: SdkCompletion
  onInsert?: (snippet: string) => void
}) {
  const { t } = useTranslation()
  const name = sdkQualifiedName(group, entry)
  const snippet = onInsert ? sdkInsertSnippet(group, entry) : null

  return (
    <li className="hover:bg-muted/40 border-b px-4 py-2.5 transition-colors last:border-b-0">
      <div className="flex items-baseline gap-2">
        <code className="text-foreground text-sm font-medium">{name}</code>
        {entry.detail && (
          <code className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {entry.detail}
          </code>
        )}
        {snippet && onInsert && (
          <button
            type="button"
            onClick={() => onInsert(snippet)}
            title={snippet}
            className="text-muted-foreground hover:text-foreground hover:bg-muted ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors"
          >
            <Plus className="size-3" />
            {t('indicatorsPage.sdkRefInsert')}
          </button>
        )}
      </div>
      {entry.info && (
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {entry.info}
        </p>
      )}
    </li>
  )
}
