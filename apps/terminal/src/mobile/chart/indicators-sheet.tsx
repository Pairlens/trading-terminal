// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The indicators panel — the phone's answer to the desktop indicator picker.
 *
 * It holds NO state of its own. `activeIndicators`, `addIndicator` and
 * `removeIndicator` are the same chart-terminal actions the desktop picker
 * drives, which is what makes an EMA added on a laptop already present here:
 * persistence (`pairlens:terminal.indicators`, per pair), cross-device restore,
 * the `indicator_added`/`indicator_removed` analytics and the `custom:*` Python
 * registration all run under the mobile provider already.
 *
 * Two things about `addIndicator` shape this screen. It is a TOGGLE, and it
 * matches on type AND params — so tapping SMA in the list can only ever remove
 * the SMA the list would have added, never an SMA(200) configured elsewhere.
 * That is why the Active section is first and carries its own remove: it is the
 * only control that can reach an instance whose params did not come from this
 * list. Editing those params is a desktop dialog for now.
 *
 * The 91 built-ins come from `@/lib/indicators/indicator-catalog` — the same
 * table the desktop picker reads, extracted from it so this panel does not
 * import a 1300-line Radix dialog to render a list. Names and categories are
 * already translated in all 17 locales; nothing here mints one.
 */
import { memo, useCallback, useMemo, useSyncExternalStore } from 'react'
import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { PRESS } from '../primitives/press'
import { useMobileFocus } from '../mobile-focus-context'
import type { IndicatorCatalogEntry } from '@/lib/indicators/indicator-catalog'
import type { IndicatorInstanceInput } from '@pairlens/fast-financial-charts/types'
import type { ReactNode } from 'react'
import {
  CATEGORY_KEYS,
  CUSTOM_CATEGORY_KEY,
  INDICATOR_CATALOG,
  buildCustomCatalogEntries,
  entryLabel,
  getCustomIndicatorsVersion,
  subscribeToCustomIndicators,
} from '@/lib/indicators/indicator-catalog'
import { getIndicatorDisplayLabel } from '@/lib/indicators/custom-indicator-definitions'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'

export type IndicatorsPanelProps = {
  /** Search text from the sheet header; '' shows everything. */
  query: string
}

/**
 * The params, as one short string.
 *
 * Values only, no keys: "20" and "12 · 26 · 9" are how a trader says EMA and
 * MACD out loud, and there is no room on a 402px row for `fast: 12`. Booleans
 * are dropped — a flag reads as noise next to a period.
 */
function paramsEcho(
  params: Record<string, boolean | number | string> | undefined,
): string {
  if (!params) return ''
  return Object.values(params)
    .filter((value) => typeof value !== 'boolean')
    .map(String)
    .join(' · ')
}

function matchesQuery(
  entry: IndicatorCatalogEntry,
  needle: string,
  t: (key: string) => string,
): boolean {
  if (!needle) return true
  return (
    entryLabel(entry, t).toLowerCase().includes(needle) ||
    entry.type.toLowerCase().includes(needle)
  )
}

export default memo(function IndicatorsPanel({ query }: IndicatorsPanelProps) {
  const { t } = useTranslation()
  const { activeIndicators } = useChartConfig()
  const { addIndicator, removeIndicator } = useChartActions()
  const { focusedPair } = useMobileFocus()

  // Rebuilt only when a `chart:indicator` provider changes the registry — a
  // plugin activating, a script saved in the workbench. Never per tick.
  const customVersion = useSyncExternalStore(
    subscribeToCustomIndicators,
    getCustomIndicatorsVersion,
    getCustomIndicatorsVersion,
  )
  const customEntries = useMemo(
    () => buildCustomCatalogEntries(),

    [customVersion],
  )

  const needle = query.trim().toLowerCase()

  const sections = useMemo(
    () =>
      CATEGORY_KEYS.map((categoryKey) => ({
        categoryKey,
        entries: (categoryKey === CUSTOM_CATEGORY_KEY
          ? customEntries
          : INDICATOR_CATALOG.filter(
              (entry) => entry.categoryKey === categoryKey,
            )
        ).filter((entry) => matchesQuery(entry, needle, t)),
        // The Custom section is absent, not empty, when no script is
        // registered: an empty heading on a phone reads as a broken feature.
      })).filter((section) => section.entries.length > 0),
    [customEntries, needle, t],
  )

  /** Which types have at least one instance on the chart. */
  const activeTypes = useMemo(
    () => new Set(activeIndicators.map((entry) => entry.type)),
    [activeIndicators],
  )

  const toggle = useCallback(
    (entry: IndicatorCatalogEntry) => {
      addIndicator({
        type: entry.type,
        seriesId: focusedPair,
        params: entry.defaultParams,
        pane: entry.pane,
      })
    },
    [addIndicator, focusedPair],
  )

  const remove = useCallback(
    (instance: IndicatorInstanceInput) => {
      // Restored instances always carry the engine id they were created with.
      // Without one, the exact-match toggle is the honest fallback — it is the
      // same instance either way.
      if (instance.id) removeIndicator(instance.id)
      else addIndicator(instance)
    },
    [addIndicator, removeIndicator],
  )

  return (
    <div className="pb-2">
      {activeIndicators.length > 0 && !needle ? (
        <section>
          <SectionHeading>{t('indicators.activeHeading')}</SectionHeading>
          {activeIndicators.map((instance, index) => (
            <ActiveRow
              instance={instance}
              key={instance.id ?? `${instance.type}-${index}`}
              onRemove={remove}
            />
          ))}
        </section>
      ) : null}

      {sections.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
          {t('indicators.noResults')}
        </p>
      ) : null}

      {sections.map((section) => (
        <section key={section.categoryKey}>
          <SectionHeading>{t(section.categoryKey)}</SectionHeading>
          {section.entries.map((entry) => (
            <CatalogRow
              active={activeTypes.has(entry.type)}
              entry={entry}
              key={entry.type}
              onToggle={toggle}
            />
          ))}
        </section>
      ))}
    </div>
  )
})

/**
 * Sticky because the list is 91 rows deep on one screen: without it a trader
 * scrolling through the oscillators has no idea which section they are in.
 * `--pl-surface` is the sheet's own fill, so the heading occludes the rows
 * passing under it instead of blending with them.
 */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <p className="sticky top-0 z-10 bg-[color:var(--pl-surface)] px-4 pb-1.5 pt-3 text-[9.5px] font-semibold uppercase tracking-[.09em] text-muted-foreground">
      {children}
    </p>
  )
}

const ROW =
  'flex w-full items-center gap-2 px-4 py-[9px] text-left min-h-[40px]'

const ActiveRow = memo(function ActiveRow({
  instance,
  onRemove,
}: {
  instance: IndicatorInstanceInput
  onRemove: (instance: IndicatorInstanceInput) => void
}) {
  const { t } = useTranslation()
  const catalogEntry = INDICATOR_CATALOG.find(
    (entry) => entry.type === instance.type,
  )
  const label = catalogEntry
    ? t(catalogEntry.labelKey)
    : getIndicatorDisplayLabel(instance.type)
  const echo = paramsEcho(instance.params)

  return (
    <div className={cn(ROW, 'bg-[color:var(--pl-wash)]')}>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
        {label}
      </span>
      <TypeAndParams echo={echo} type={instance.type} />
      <button
        aria-label={t('mobile.chart.removeIndicator', { name: label })}
        className="pl-hit-44 pl-press -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        onClick={() => onRemove(instance)}
        type="button"
        {...PRESS}
      >
        <X className="size-4" />
      </button>
    </div>
  )
})

const CatalogRow = memo(function CatalogRow({
  entry,
  active,
  onToggle,
}: {
  entry: IndicatorCatalogEntry
  active: boolean
  onToggle: (entry: IndicatorCatalogEntry) => void
}) {
  const { t } = useTranslation()
  const echo = paramsEcho(entry.defaultParams)

  return (
    <button
      aria-pressed={active}
      className={cn(ROW, 'pl-press-row')}
      onClick={() => onToggle(entry)}
      type="button"
      {...PRESS}
    >
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[14px]',
          active ? 'font-semibold text-foreground' : 'text-foreground',
        )}
      >
        {entryLabel(entry, t)}
      </span>
      <TypeAndParams echo={echo} type={entry.type} />
      <span className="flex size-4 shrink-0 items-center justify-center">
        {active ? <Check className="size-4 text-primary" /> : null}
      </span>
    </button>
  )
})

/**
 * "EMA 20" — the code a trader says out loud, then what tapping the row will
 * add. The translated names are the searchable, scannable column; the code is
 * how the same indicator is written on every other terminal, and it is what
 * the desktop picker puts here too.
 */
function TypeAndParams({ type, echo }: { type: string; echo: string }) {
  const code = type.startsWith('custom:')
    ? (type.split(':').pop() ?? type)
    : type
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
      {code}
      {echo ? <span className="ml-1.5 opacity-70">{echo}</span> : null}
    </span>
  )
}
