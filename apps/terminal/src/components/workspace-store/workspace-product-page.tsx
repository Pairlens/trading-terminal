// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'
import { ChevronLeft, Download, Heart, Loader2, Trash2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'

import { POSTER_MORPH, SectionEyebrow, StoreAurora } from '../store/store-shell'
import { PluginRequirements } from './plugin-requirements'
import { WorkspaceLayoutPreview } from './workspace-layout-preview'
import type { TemplateDependencyReport } from '@/lib/workspace-store/dependency-analysis'
import type { WorkspaceTemplate } from '@/lib/workspace-store/types'
import {
  assetClassLabel,
  screenSizeLabel,
  templateDescription,
  templateName,
  templateTagline,
  traderTypeLabel,
} from '@/lib/workspace-store/template-labels'

function VariableSummary({ template }: { template: WorkspaceTemplate }) {
  const { t } = useTranslation()
  if (template.variables.length === 0) return null
  const parts = template.variables.map((v) => {
    if (v.type === 'pair') {
      const val = v.defaultValue as
        | { pairKey?: string; market?: string }
        | undefined
      return val?.pairKey
        ? t('workspaceStore.opensOn', {
            defaultValue: 'Opens on {{pair}} · {{market}}',
            pair: val.pairKey,
            market: val.market,
          })
        : t('workspaceStore.picksPair', 'Prompts you to pick a pair')
    }
    if (v.type === 'wallet') {
      return t('workspaceStore.picksAccount', 'Prompts you to pick an account')
    }
    return `${v.label}`
  })
  return (
    <p className="mt-3 font-mono text-xs text-muted-foreground/80">
      {parts.join(' · ')}
    </p>
  )
}

/**
 * Full-screen template product page — the workspace-store sibling of the
 * plugin product page. Opens over the store body with its own scroll.
 */
export function WorkspaceProductPage({
  template,
  report,
  applying,
  posterLayoutId,
  onBack,
  onApply,
  onDelete,
  deleting,
  onToggleFavorite,
  favoritePending,
}: {
  template: WorkspaceTemplate
  report: TemplateDependencyReport | null
  applying: boolean
  /** Shared-element id of the poster this page was opened from. */
  posterLayoutId?: string | null
  onBack: () => void
  onApply: () => void
  /** When set, a "Remove from store" action is shown (viewer owns this share). */
  onDelete?: () => void
  deleting?: boolean
  /** When set, the fav count becomes an interactive toggle. */
  onToggleFavorite?: () => void
  favoritePending?: boolean
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion() ?? false
  const scrollRef = useRef<HTMLDivElement>(null)

  const isCommunity = template.origin === 'community'
  const faved = template.community?.faved ?? false
  const paneCount = template.layout.columns.reduce(
    (acc, col) =>
      acc + col.cells.reduce((cellAcc, cell) => cellAcc + cell.panes.length, 0),
    0,
  )
  const traderLabels = template.facets.traderTypes
    .map((tt) => traderTypeLabel(t, tt))
    .join(' · ')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [template.id])

  return (
    <motion.div
      ref={scrollRef}
      className="absolute inset-0 z-40 overflow-y-auto bg-card"
      // Opacity only — a transform here would skew the shared-element morph's
      // layout measurements. The hero text carries the rise instead.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <StoreAurora className="fixed" />

      {/* Sticky sub-bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-card/70 px-5 py-2.5 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t('workspaceStore.backToStore', 'Store')}
        </button>
        <div className="flex items-center gap-3">
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
              className="text-destructive hover:text-destructive"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t('workspaceStore.share.remove', 'Remove from store')}
            </Button>
          )}
          {onToggleFavorite && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFavorite}
              disabled={favoritePending}
              aria-pressed={faved}
              className={cn(faved && 'text-rose-500')}
            >
              <Heart className={cn('size-3.5', faved && 'fill-current')} />
              {template.community?.favorites ?? 0}
            </Button>
          )}
          <Button onClick={onApply} disabled={applying}>
            {applying && <Loader2 className="size-4 animate-spin" />}
            {t('workspaceStore.addToMine', 'Add to my workspaces')}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="relative z-10 mx-auto max-w-[1060px] px-11 pb-16 pt-6">
        {/* Title — the only thing above the layout */}
        {/* Carries the enter rise so the morph below stays accurate */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 10 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            {t('workspaceStore.eyebrow', 'Workspace')}
          </span>
          <h1 className="mt-3 font-serif text-[46px] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground">
            {templateName(t, template)}
          </h1>
        </motion.div>

        {/* The big layout preview — the poster morphs into this as it scales up */}
        <motion.div
          layoutId={posterLayoutId ?? undefined}
          transition={POSTER_MORPH}
          className="mt-7 border border-border bg-card/80 p-4 shadow-lg backdrop-blur-sm"
          style={{ borderRadius: 17 }}
        >
          <WorkspaceLayoutPreview
            layout={template.layout}
            detailed
            className="h-[380px] max-md:h-64"
          />
        </motion.div>

        {/* Everything else lives below the layout */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 10 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            {template.facets.assetClasses.map((ac) => (
              <Badge key={ac} variant="outline" className="text-[10px]">
                {assetClassLabel(t, ac)}
              </Badge>
            ))}
            {template.facets.screenSizes.map((ss) => (
              <Badge
                key={ss}
                variant="outline"
                className="text-[10px] text-muted-foreground"
              >
                {screenSizeLabel(t, ss)}
              </Badge>
            ))}
            <span className="font-mono text-xs text-muted-foreground/80">
              {template.author}
              <span className="mx-2 text-border">/</span>
              {traderLabels || t('workspaceStore.anyTrader', 'Any trader')}
              <span className="mx-2 text-border">/</span>
              {t('workspaceStore.paneCount', {
                defaultValue: '{{count}} panes',
                count: paneCount,
              })}
            </span>
          </div>
          <p className="mt-4 max-w-[52ch] text-base leading-[1.6] text-muted-foreground">
            {templateTagline(t, template)}
          </p>
          <VariableSummary template={template} />

          {/* Overview */}
          <section className="mt-10">
            <SectionEyebrow>
              {t('workspaceStore.overview', 'Overview')}
            </SectionEyebrow>
            <p className="mt-3 max-w-[74ch] text-[14.5px] leading-[1.7] text-muted-foreground">
              {templateDescription(t, template)}
            </p>
          </section>
        </motion.div>

        {/* Two-column footer: plugins & access / details */}
        <div className="mt-12 flex gap-10 max-md:flex-col">
          <section className="min-w-0 flex-1">
            <SectionEyebrow>
              {t('workspaceStore.pluginsHeading', 'Plugins & access')}
            </SectionEyebrow>
            <div className="mt-3">
              {report ? <PluginRequirements report={report} /> : null}
            </div>
          </section>

          <section className="w-[300px] shrink-0 max-md:w-full">
            <SectionEyebrow>
              {t('workspaceStore.detailsHeading', 'Details')}
            </SectionEyebrow>
            <div className="mt-3 divide-y divide-border/50 rounded-[14px] border border-border/70">
              <DetailsRow
                label={t('workspaceStore.author', 'Author')}
                value={template.author}
              />
              <DetailsRow
                label={t('workspaceStore.source.label', 'Source')}
                value={
                  isCommunity
                    ? t('workspaceStore.source.community', 'Community')
                    : t('workspaceStore.source.builtin', 'Pairlens')
                }
              />
              <DetailsRow
                label={t('workspaceStore.panes', 'Panes')}
                value={String(paneCount)}
                mono
              />
              {template.facets.traderTypes.length > 0 && (
                <DetailsRow
                  label={t('workspaceStore.facet.trader', 'Trader')}
                  value={traderLabels}
                />
              )}
              {isCommunity && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    {t('workspaceStore.community.downloads', 'Downloads')}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-foreground/90">
                    <Download className="size-3" />
                    {template.community?.installs ?? 0}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  )
}

function DetailsRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'truncate text-right text-xs text-foreground/90',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  )
}
