// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, LayoutTemplate, Share2 } from 'lucide-react'
import { AnimatePresence, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'

import { StoreAurora, StoreShelf } from '../store/store-shell'
import { ShareWorkspaceDialog } from './share-workspace-dialog'
import { WorkspaceLayoutPreview } from './workspace-layout-preview'
import { WorkspaceProductPage } from './workspace-product-page'
import { WorkspaceStoreCard } from './workspace-store-card'
import type { TemplateDependencyReport } from '@/lib/workspace-store/dependency-analysis'
import type {
  AssetClass,
  ScreenSize,
  TraderType,
  WorkspaceTemplate,
} from '@/lib/workspace-store/types'
import { track } from '@/lib/analytics-events'
import { useFullTrustConsent } from '@/components/plugins/full-trust-consent'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { usePairlens } from '@/lib/pairlens-provider'
import { setPluginTrust } from '@/lib/plugins/plugin-ledger'
import { reinstallBundledPlugin } from '@/lib/plugins/bootstrap-reinstall'
import { analyzeTemplateDependencies } from '@/lib/workspace-store/dependency-analysis'
import {
  ASSET_CLASSES,
  SCREEN_SIZES,
  TRADER_TYPES,
  templateToWorkspaceParams,
} from '@/lib/workspace-store/catalog'
import {
  assetClassLabel,
  screenSizeLabel,
  templateDescription,
  templateName,
  templateTagline,
  traderTypeDescription,
  traderTypeLabel,
} from '@/lib/workspace-store/template-labels'
import { useWorkspaceTemplates } from '@/lib/workspace-store/use-workspace-templates'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'
import { queryKeys } from '@/lib/api'

type SourceFilter = 'all' | 'builtin' | 'community' | 'mine'

const HERO_ROTATE_MS = 4800

// ---------------------------------------------------------------------------
// Spotlight hero — featured templates, workspace flavor
// ---------------------------------------------------------------------------

function WorkspaceSpotlight({
  templates,
  paused,
  applying,
  onApply,
  onDetails,
}: {
  templates: Array<WorkspaceTemplate>
  paused: boolean
  applying: boolean
  onApply: (template: WorkspaceTemplate) => void
  onDetails: (template: WorkspaceTemplate) => void
}) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)

  const count = templates.length
  const stop = paused || hovered || reduceMotion || count <= 1

  useEffect(() => {
    if (stop) return
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % count),
      HERO_ROTATE_MS,
    )
    return () => clearInterval(timer)
  }, [stop, count])

  if (count === 0) return null
  const template = templates[Math.min(index, count - 1)]
  const traderLabels = template.facets.traderTypes
    .map((tt) => traderTypeLabel(t, tt))
    .join(' · ')

  return (
    <section
      className="relative h-[400px] w-full overflow-hidden rounded-[22px] border border-border"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(100deg, var(--card) 32%, color-mix(in oklch, var(--primary) 22%, var(--card)) 100%)',
        }}
      />

      {/* Layout schematic anchored right */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[6%] top-1/2 flex -translate-y-1/2 items-center justify-center max-lg:hidden"
      >
        <div
          className="absolute size-[420px] rounded-full"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 66%)',
          }}
        />
        <span
          className="pl-store-ring absolute size-[360px] rounded-full border"
          style={{
            borderColor:
              'color-mix(in oklch, var(--foreground) 12%, transparent)',
            animation: 'pl-store-spin 34s linear infinite',
          }}
        />
        <div
          key={template.id}
          className="pl-store-heroin relative w-[380px] rounded-[17px] border border-border bg-card/80 p-3 shadow-lg backdrop-blur-sm"
        >
          <WorkspaceLayoutPreview
            layout={template.layout}
            detailed
            className="h-[220px]"
          />
        </div>
      </div>

      {/* Left scrim */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, var(--card) 36%, transparent 74%)',
        }}
      />

      {/* Content */}
      <div
        key={template.id}
        className="pl-store-heroin relative z-10 flex h-full max-w-[58%] flex-col justify-center px-[52px] max-lg:max-w-full"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">
            {t('workspaceStore.spotlight', 'Spotlight')}
          </span>
          <span className="size-[5px] rounded-full bg-primary" />
          <span className="text-[11px] text-muted-foreground">
            {traderLabels || t('workspaceStore.anyTrader', 'Any trader')} ·{' '}
            {template.author}
          </span>
        </div>
        <h2 className="mt-4 max-w-[16ch] font-serif text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground">
          {templateName(t, template)}
        </h2>
        <p className="mt-4 max-w-[47ch] text-[15px] leading-[1.6] text-muted-foreground">
          {templateTagline(t, template)}
        </p>
        <div className="mt-[26px] flex items-center gap-[13px]">
          <Button
            size="lg"
            disabled={applying}
            onClick={() => onApply(template)}
          >
            {t('workspaceStore.addToMine', 'Add to my workspaces')}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => onDetails(template)}
          >
            {t('workspaceStore.details', 'Details')}
          </Button>
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label={t('workspaceStore.previousSlide', 'Previous')}
            onClick={() => setIndex((index - 1 + count) % count)}
            className="absolute left-4 top-1/2 z-10 flex size-[34px] -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background/70 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t('workspaceStore.nextSlide', 'Next')}
            onClick={() => setIndex((index + 1) % count)}
            className="absolute right-4 top-1/2 z-10 flex size-[34px] -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background/70 hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="absolute bottom-6 left-[52px] z-10 flex items-center gap-1.5">
            {templates.map((tpl, i) => (
              <button
                key={tpl.id}
                type="button"
                aria-label={t('workspaceStore.goToSlide', {
                  defaultValue: 'Go to slide {{number}}',
                  number: i + 1,
                })}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-1 rounded-[2px] transition-all',
                  i === index
                    ? 'w-[26px] bg-foreground/80'
                    : 'w-[10px] bg-foreground/25 hover:bg-foreground/40',
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Facet chips
// ---------------------------------------------------------------------------

type FacetGroupProps<T extends string> = {
  label: string
  values: ReadonlyArray<T>
  labelOf: (v: T) => string
  active: T | null
  onChange: (v: T | null) => void
}

function FacetGroup<T extends string>({
  label,
  values,
  labelOf,
  active,
  onChange,
}: FacetGroupProps<T>) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-14 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          'rounded-full px-2.5 py-1 text-xs transition-colors',
          active === null
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted',
        )}
      >
        {t('workspaceStore.all', 'All')}
      </button>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(active === v ? null : v)}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs transition-colors',
            active === v
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {labelOf(v)}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function WorkspaceStore({
  autoOpenTemplateId,
  initialAssetClass,
  search = '',
}: {
  autoOpenTemplateId?: string
  /** Pre-selected asset-class facet (links from a pair page's menu). */
  initialAssetClass?: AssetClass
  /** Live search query — owned by the page header. */
  search?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { templates, registry: storeRegistry } = useWorkspaceTemplates()
  const { pluginManager, pluginStateVersion, notifyPluginStateChange } =
    usePairlens()
  const registry = usePaneRegistry()
  const registryVersion = registry.getSnapshot()

  const loadWorkspaces = useCustomWorkspacesStore((s) => s.load)
  const createWorkspace = useCustomWorkspacesStore((s) => s.createWorkspace)
  const { requestFullTrust, dialog: consentDialog } = useFullTrustConsent()
  const queryClient = useQueryClient()

  // Guard against clobbering the persisted list before it's hydrated.
  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const [source, setSource] = useState<SourceFilter>('all')
  const [trader, setTrader] = useState<TraderType | null>(null)
  const [asset, setAsset] = useState<AssetClass | null>(
    initialAssetClass ?? null,
  )
  const [screen, setScreen] = useState<ScreenSize | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(
    autoOpenTemplateId ?? null,
  )
  useEffect(() => {
    if (selectedId) {
      track('workspace_template_viewed', { template_id: selectedId })
    }
  }, [selectedId])
  const [posterLayoutId, setPosterLayoutId] = useState<string | null>(null)
  const reduceMotion = useReducedMotion() ?? false
  const [applying, setApplying] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const applyInFlight = useRef(false)

  // One dependency report per template, refreshed when plugin state changes.
  const reports = useMemo(() => {
    const map = new Map<string, TemplateDependencyReport>()
    const installed = pluginManager.getInstalledPlugins()
    for (const tpl of templates) {
      map.set(
        tpl.id,
        analyzeTemplateDependencies(tpl, installed, (paneType) =>
          registry.getPluginForPane(paneType),
        ),
      )
    }
    return map
  }, [templates, pluginManager, registry, pluginStateVersion, registryVersion])

  const query = search.trim().toLowerCase()
  const filtering =
    query.length > 0 ||
    source !== 'all' ||
    trader !== null ||
    asset !== null ||
    screen !== null

  const filtered = useMemo(() => {
    return templates.filter((tpl) => {
      const isCommunity = tpl.origin === 'community'
      if (source === 'builtin' && isCommunity) return false
      if (source === 'community' && !isCommunity) return false
      if (source === 'mine' && !tpl.community?.mine) return false
      if (trader && !tpl.facets.traderTypes.includes(trader)) return false
      if (asset && !tpl.facets.assetClasses.includes(asset)) return false
      if (screen && !tpl.facets.screenSizes.includes(screen)) return false
      if (query) {
        const haystack = [
          templateName(t, tpl),
          templateTagline(t, tpl),
          templateDescription(t, tpl),
          ...(tpl.tags ?? []),
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [templates, query, source, trader, asset, screen, t])

  const featured = useMemo(
    () => templates.filter((tpl) => tpl.featured),
    [templates],
  )

  // Topic shelves (browse mode): one per trader type, then community + yours.
  const traderShelves = useMemo(() => {
    return TRADER_TYPES.map((tt) => ({
      id: tt,
      label: traderTypeLabel(t, tt),
      subLabel: traderTypeDescription(t, tt),
      templates: templates.filter((tpl) => tpl.facets.traderTypes.includes(tt)),
    })).filter((shelf) => shelf.templates.length > 0)
  }, [templates, t])

  const communityShelf = useMemo(
    () => templates.filter((tpl) => tpl.origin === 'community'),
    [templates],
  )
  const mineShelf = useMemo(
    () => templates.filter((tpl) => tpl.community?.mine),
    [templates],
  )

  const selected = useMemo(
    () => templates.find((tpl) => tpl.id === selectedId) ?? null,
    [templates, selectedId],
  )
  const selectedReport = selected ? (reports.get(selected.id) ?? null) : null

  const applyTemplate = useCallback(
    async (template: WorkspaceTemplate) => {
      if (applyInFlight.current) return
      applyInFlight.current = true
      const report = reports.get(template.id)
      setApplying(true)
      try {
        // Security gate: every full-access plugin that isn't already trusted must
        // be explicitly approved before we adopt a workspace that relies on it.
        // Gather all approvals first and commit the grants only once every one
        // succeeds — so declining a later plugin never leaves an earlier one
        // silently granted full access to credentials and trades.
        const toTrust = report?.untrustedFullTrust ?? []
        for (const plugin of toTrust) {
          const granted = await requestFullTrust({ name: plugin.name })
          if (!granted) return
        }
        for (const plugin of toTrust) {
          setPluginTrust(plugin.pluginId, 'full')
        }
        if (toTrust.length > 0) notifyPluginStateChange()

        // Bundled plugins this workspace needs but the user uninstalled come
        // straight back from the binary — first-party code, already trusted,
        // no download. Registry plugins still have to be fetched by hand from
        // the Plugin Store, which is what the "missing" toast below is about.
        const bundledMissing = (report?.plugins ?? []).filter(
          (p) => p.status === 'missing-bundled',
        )
        const reinstalled: Array<string> = []
        const failed: Array<string> = []
        for (const plugin of bundledMissing) {
          try {
            const manifest = await reinstallBundledPlugin({
              manager: pluginManager,
              pluginId: plugin.pluginId,
            })
            reinstalled.push(manifest.name)
          } catch {
            failed.push(plugin.name)
          }
        }
        if (reinstalled.length > 0 || failed.length > 0) {
          notifyPluginStateChange()
        }
        if (reinstalled.length > 0) {
          toast.success(
            t('workspaceStore.bundledInstalled', {
              names: reinstalled.join(', '),
            }),
          )
        }
        if (failed.length > 0) {
          toast.error(
            t('workspaceStore.bundledInstallFailed', {
              names: failed.join(', '),
            }),
          )
        }

        const id = createWorkspace(templateToWorkspaceParams(template))
        track('workspace_template_applied', {
          template_id: template.id,
          community: Boolean(template.community),
        })
        // Bump the provider's popularity counter (best-effort, if supported).
        const provider = storeRegistry.providerFor(template)
        if (template.community && provider?.capabilities.install) {
          void provider
            .install?.(template.community.submissionId)
            .then(() =>
              queryClient.invalidateQueries({
                queryKey: queryKeys.workspaceStore(),
              }),
            )
            .catch(() => {})
        }
        setSelectedId(null)
        const stillMissing = (report?.missingCount ?? 0) - reinstalled.length
        if (stillMissing > 0) {
          toast.info(
            t('workspaceStore.addedWithMissing', {
              defaultValue:
                '“{{name}}” added. Install the missing plugins to fill every panel.',
              name: templateName(t, template),
            }),
          )
        } else {
          toast.success(
            t('workspaceStore.added', {
              defaultValue: '“{{name}}” added to your workspaces.',
              name: templateName(t, template),
            }),
          )
        }
        void navigate({
          to: '/workspace/$workspaceId',
          params: { workspaceId: id },
        })
      } finally {
        applyInFlight.current = false
        setApplying(false)
      }
    },
    [
      reports,
      requestFullTrust,
      pluginManager,
      notifyPluginStateChange,
      createWorkspace,
      navigate,
      queryClient,
      storeRegistry,
      t,
    ],
  )

  // Remove one of the viewer's own submissions via its owning provider.
  const deleteMutation = useMutation({
    mutationFn: (template: WorkspaceTemplate) => {
      const provider = storeRegistry.providerFor(template)
      if (!provider?.delete || !template.community) {
        throw new Error('This template cannot be removed')
      }
      return provider.delete(template.community.submissionId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceStore(),
      })
      setSelectedId(null)
      toast.success(
        t('workspaceStore.share.removed', 'Removed from the store.'),
      )
    },
    onError: (e) => {
      toast.error(
        t('workspaceStore.share.removeError', 'Could not remove from store'),
        { description: e.message },
      )
    },
  })

  const handleDelete = useCallback(() => {
    if (selected) deleteMutation.mutate(selected)
  }, [selected, deleteMutation])

  // Toggle a favourite via the owning provider, with an optimistic list patch.
  // Toggles are serialized per template (the control disables while pending) so
  // rapid double-clicks can't desync the request direction from the UI.
  const [pendingFavs, setPendingFavs] = useState<ReadonlySet<string>>(new Set())
  const favoriteMutation = useMutation({
    mutationFn: (template: WorkspaceTemplate) => {
      const provider = storeRegistry.providerFor(template)
      if (!provider?.favorite || !template.community) {
        throw new Error(
          t(
            'workspaceStore.share.favError',
            'This template cannot be favourited',
          ),
        )
      }
      return provider.favorite(
        template.community.submissionId,
        !template.community.faved,
      )
    },
    onMutate: async (template) => {
      setPendingFavs((prev) => new Set(prev).add(template.id))
      const key = queryKeys.workspaceStore()
      // Cancel in-flight refetches so they can't clobber the optimistic patch.
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueriesData<Array<WorkspaceTemplate>>({
        queryKey: key,
      })
      queryClient.setQueriesData<Array<WorkspaceTemplate>>(
        { queryKey: key },
        (list) =>
          (list ?? []).map((tpl) =>
            tpl.id === template.id && tpl.community
              ? {
                  ...tpl,
                  community: {
                    ...tpl.community,
                    faved: !tpl.community.faved,
                    favorites: Math.max(
                      0,
                      tpl.community.favorites + (tpl.community.faved ? -1 : 1),
                    ),
                  },
                }
              : tpl,
          ),
      )
      return { previous }
    },
    onError: (_e, _template, context) => {
      // Restore the exact pre-toggle snapshot.
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
    onSuccess: (result, template) => {
      // Reconcile with the server's authoritative counts.
      queryClient.setQueriesData<Array<WorkspaceTemplate>>(
        { queryKey: queryKeys.workspaceStore() },
        (list) =>
          (list ?? []).map((tpl) =>
            tpl.id === template.id && tpl.community
              ? {
                  ...tpl,
                  community: {
                    ...tpl.community,
                    faved: result.faved,
                    favorites: result.favorites,
                  },
                }
              : tpl,
          ),
      )
    },
    onSettled: (_r, _e, template) => {
      setPendingFavs((prev) => {
        const next = new Set(prev)
        next.delete(template.id)
        return next
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceStore(),
      })
    },
  })

  const handleToggleFavorite = useCallback(
    (template: WorkspaceTemplate) => {
      if (pendingFavs.has(template.id)) return
      favoriteMutation.mutate(template)
    },
    [favoriteMutation, pendingFavs],
  )

  const selectedProvider = selected ? storeRegistry.providerFor(selected) : null

  // Shelf-scoped shared-element ids: a template can sit on several shelves at
  // once, and duplicate layoutIds would confuse the morph.
  const renderCard = (tpl: WorkspaceTemplate, shelfKey: string) => {
    const layoutId = reduceMotion
      ? undefined
      : `workspace-poster-${shelfKey}-${tpl.id}`
    return (
      <WorkspaceStoreCard
        key={tpl.id}
        template={tpl}
        readiness={reports.get(tpl.id)?.readiness ?? 'ready'}
        onSelect={() => {
          setPosterLayoutId(layoutId ?? null)
          setSelectedId(tpl.id)
        }}
        canFavorite={!!storeRegistry.providerFor(tpl)?.capabilities.favorite}
        favoritePending={pendingFavs.has(tpl.id)}
        onToggleFavorite={() => handleToggleFavorite(tpl)}
        layoutId={layoutId}
      />
    )
  }

  return (
    <div className="relative h-full">
      <StoreAurora />

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="mx-auto max-w-[1180px] px-[30px] pb-10 pt-6">
          {/* Spotlight hero */}
          {!filtering && featured.length > 0 && (
            <WorkspaceSpotlight
              templates={featured}
              paused={selected !== null}
              applying={applying}
              onApply={(tpl) => void applyTemplate(tpl)}
              onDetails={(tpl) => setSelectedId(tpl.id)}
            />
          )}

          {/* Filters row */}
          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 w-14 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('workspaceStore.source.label', 'Source')}
                </span>
                {(
                  [
                    ['all', t('workspaceStore.source.all', 'All')],
                    ['builtin', t('workspaceStore.source.builtin', 'Pairlens')],
                    [
                      'community',
                      t('workspaceStore.source.community', 'Community'),
                    ],
                    ['mine', t('workspaceStore.source.mine', 'Yours')],
                  ] as Array<[SourceFilter, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSource(value)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs transition-colors',
                      source === value
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <FacetGroup
                label={t('workspaceStore.facet.trader', 'Trader')}
                values={TRADER_TYPES}
                labelOf={(v) => traderTypeLabel(t, v)}
                active={trader}
                onChange={setTrader}
              />
              <FacetGroup
                label={t('workspaceStore.facet.asset', 'Asset')}
                values={ASSET_CLASSES}
                labelOf={(v) => assetClassLabel(t, v)}
                active={asset}
                onChange={setAsset}
              />
              <FacetGroup
                label={t('workspaceStore.facet.screen', 'Screen')}
                values={SCREEN_SIZES}
                labelOf={(v) => screenSizeLabel(t, v)}
                active={screen}
                onChange={setScreen}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="size-3.5" />
              {t('workspaceStore.share.cta', 'Share a workspace')}
            </Button>
          </div>

          {/* Filtered grid */}
          {filtering ? (
            filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <span className="flex size-12 items-center justify-center rounded-[14px] border border-border/70 bg-card text-muted-foreground">
                  <LayoutTemplate className="size-5" />
                </span>
                <p className="font-serif text-xl font-semibold">
                  {t('workspaceStore.noResultsTitle', 'Nothing matches')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'workspaceStore.noResults',
                    'No workspaces match those filters.',
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSource('all')
                    setTrader(null)
                    setAsset(null)
                    setScreen(null)
                  }}
                >
                  {t('workspaceStore.clearFilters', 'Clear filters')}
                </Button>
              </div>
            ) : (
              <div className="mt-8 flex flex-wrap gap-4">
                {filtered.map((tpl) => renderCard(tpl, 'all'))}
              </div>
            )
          ) : (
            <>
              {/* Topic shelves */}
              {featured.length > 0 && (
                <StoreShelf
                  label={t('workspaceStore.editorsPicks', "Editor's picks")}
                  subLabel={t('workspaceStore.curated', 'Curated layouts')}
                >
                  {featured.map((tpl) => renderCard(tpl, 'picks'))}
                </StoreShelf>
              )}
              {traderShelves.map((shelf) => (
                <StoreShelf
                  key={shelf.id}
                  label={shelf.label}
                  subLabel={shelf.subLabel}
                  onShowAll={() => setTrader(shelf.id)}
                  showAllLabel={t('workspaceStore.showAll', 'Show all')}
                >
                  {shelf.templates.map((tpl) => renderCard(tpl, shelf.id))}
                </StoreShelf>
              ))}
              {communityShelf.length > 0 && (
                <StoreShelf
                  label={t('workspaceStore.source.community', 'Community')}
                  subLabel={t(
                    'workspaceStore.communitySub',
                    'Shared by other traders',
                  )}
                  onShowAll={() => setSource('community')}
                  showAllLabel={t('workspaceStore.showAll', 'Show all')}
                >
                  {communityShelf.map((tpl) => renderCard(tpl, 'community'))}
                </StoreShelf>
              )}
              {mineShelf.length > 0 && (
                <StoreShelf
                  label={t('workspaceStore.source.mine', 'Yours')}
                  subLabel={t(
                    'workspaceStore.mineSub',
                    'Workspaces you shared',
                  )}
                  onShowAll={() => setSource('mine')}
                  showAllLabel={t('workspaceStore.showAll', 'Show all')}
                >
                  {mineShelf.map((tpl) => renderCard(tpl, 'mine'))}
                </StoreShelf>
              )}
            </>
          )}
        </div>
      </div>

      {/* Full-screen product page */}
      <AnimatePresence>
        {selected && (
          <WorkspaceProductPage
            key={selected.id}
            template={selected}
            posterLayoutId={posterLayoutId}
            report={selectedReport}
            applying={applying}
            onBack={() => setSelectedId(null)}
            onApply={() => void applyTemplate(selected)}
            onDelete={
              selectedProvider?.capabilities.delete && selected.community?.mine
                ? handleDelete
                : undefined
            }
            deleting={deleteMutation.isPending}
            onToggleFavorite={
              selectedProvider?.capabilities.favorite
                ? () => handleToggleFavorite(selected)
                : undefined
            }
            favoritePending={pendingFavs.has(selected.id)}
          />
        )}
      </AnimatePresence>

      <ShareWorkspaceDialog open={shareOpen} onOpenChange={setShareOpen} />
      {consentDialog}
    </div>
  )
}
