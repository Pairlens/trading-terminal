// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft } from 'lucide-react'
import { AnimatePresence, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@pairlens/ui/components/ui/alert'

import { StoreAurora, StoreShelf } from '../store/store-shell'
import { useFullTrustConsent } from './full-trust-consent'
import { useNetworkConsent } from './network-consent'
import { useRegistrySettings } from './use-registry-settings'
import { SpotlightHero } from './featured-hero-card'
import { PluginProductPage } from './plugin-product-page'
import { PluginStoreCard } from './plugin-store-card'
import { ThemeStoreCard } from './theme-store-card'
import {
  FeaturedHeroSkeleton,
  PosterCardSkeleton,
  ShelfSkeleton,
} from './plugin-store-skeletons'
import { useRegistryFeatured, useRegistryPlugins } from './use-registry'
import type {
  RegistryCategory,
  RegistryPluginEntry,
} from '@pairlens/shared/registry-types'
import type { FormEvent } from 'react'
import type { PluginManifest } from '@pairlens/plugin-system'
import type { PluginStateResponse } from '@/lib/api'
import type { PluginTrustLevel } from '@/lib/plugins/plugin-ledger'
import { track } from '@/lib/analytics-events'
import { authClient } from '@/lib/auth-client'
import { api, queryKeys } from '@/lib/api'
import {
  removeFromLedger,
  setLedgerConfig,
  setLedgerEnabled,
  upsertLedgerEntry,
} from '@/lib/plugins/plugin-ledger'
import { buildActivationConfig } from '@/lib/plugins/official-config'
import {
  reloadForGrants,
  requestAndApplyNetworkConsent,
} from '@/lib/plugins/network-grants'
import { isCommunityEntry } from '@/lib/plugins/community-tier'
import {
  PluginFullTrustRequiredError,
  PluginModuleLoader,
} from '@/lib/plugins/plugin-module-loader'
import { usePairlens } from '@/lib/pairlens-provider'
import { pluginDescription, pluginTitle } from '@/lib/plugin-text'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isThemeManifest(manifest: PluginManifest): boolean {
  return manifest.capabilities.some((c) => c.id === 'theme:override')
}

function isPlatformCompatible(_manifest: PluginManifest): boolean {
  return true
}

function getPlatformBadgeKey(
  _manifest: PluginManifest,
): 'pluginStore.desktopOnly' | 'pluginStore.browserOnly' | null {
  return null
}

function isExchangeManifest(manifest: PluginManifest): boolean {
  return manifest.capabilities.some((c) => c.id === 'market-data:candles')
}

function manifestToEntry(manifest: PluginManifest): RegistryPluginEntry {
  const category = isThemeManifest(manifest)
    ? 'themes'
    : isExchangeManifest(manifest)
      ? 'exchange'
      : 'installed'
  return {
    manifest,
    category,
    tagline: pluginDescription(manifest),
    bundled: true,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type PluginStoreProps = {
  autoOpenPluginId?: string
  /** Live search query — owned by the page header. */
  search?: string
}

export function PluginStore({
  autoOpenPluginId,
  search = '',
}: PluginStoreProps = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion() ?? false
  const { pluginManager, notifyPluginStateChange } = usePairlens()
  const { requestFullTrust, dialog: fullTrustDialog } = useFullTrustConsent()
  const { requestNetworkConsent, dialog: networkConsentDialog } =
    useNetworkConsent()

  const resolvePlatformBadge = (manifest: PluginManifest): string | null => {
    const key = getPlatformBadgeKey(manifest)
    return key ? t(key) : null
  }

  // Registry URL + module loader
  const { effectiveUrl } = useRegistrySettings()
  const moduleLoaderRef = useRef<PluginModuleLoader | null>(null)
  const installInFlight = useRef(new Set<string>())
  if (!moduleLoaderRef.current) {
    moduleLoaderRef.current = new PluginModuleLoader(effectiveUrl)
  }
  moduleLoaderRef.current.setRegistryUrl(effectiveUrl)
  moduleLoaderRef.current.setAuthTokenProvider(async () => {
    const session = await authClient.getSession()
    return session.data?.session?.token ?? ''
  })

  // Registry data
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(
    undefined,
  )
  const registryQuery = useRegistryPlugins(categoryFilter)
  const featuredQuery = useRegistryFeatured()
  const registryOffline = registryQuery.isError

  // Auto-open the product page when ?manage=pluginId is present
  useEffect(() => {
    if (!autoOpenPluginId) return
    const plugin = pluginManager
      .getInstalledPlugins()
      .find((p) => p.manifest.id === autoOpenPluginId)
    if (plugin) {
      setSelectedEntry(manifestToEntry(plugin.manifest))
    }
  }, [autoOpenPluginId, pluginManager])

  // Plugin states from App Server persistence
  const statesQuery = useQuery({
    queryKey: queryKeys.pluginStates(),
    queryFn: () => api.getPluginStates(),
  })

  const statesMap = useMemo(() => {
    const map: Record<string, PluginStateResponse> = {}
    for (const s of statesQuery.data ?? []) {
      map[s.pluginId] = s
    }
    return map
  }, [statesQuery.data])

  const saveStateMutation = useMutation({
    mutationFn: (data: {
      pluginId: string
      enabled: boolean
      config: Record<string, unknown>
    }) => api.setPluginState(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.pluginStates() }),
  })

  // Product page state
  const [selectedEntry, setSelectedEntry] =
    useState<RegistryPluginEntry | null>(null)
  const selectedPluginId = selectedEntry?.manifest.id
  useEffect(() => {
    if (selectedPluginId) {
      track('plugin_page_viewed', { plugin_id: selectedPluginId })
    }
  }, [selectedPluginId])
  const [posterLayoutId, setPosterLayoutId] = useState<string | null>(null)
  const [configDrafts, setConfigDrafts] = useState<
    Record<string, Record<string, unknown>>
  >({})
  const [feedback, setFeedback] = useState<
    Record<string, { type: 'error' | 'success'; message: string }>
  >({})
  const [busyPluginId, setBusyPluginId] = useState<string | null>(null)

  // Helpers
  const isActive = useCallback(
    (pluginId: string) => {
      const installed = pluginManager.getInstalledPlugins()
      const plugin = installed.find((p) => p.manifest.id === pluginId)
      return plugin?.status === 'active'
    },
    [pluginManager],
  )

  const isInstalled = useCallback(
    (pluginId: string) => {
      return pluginManager
        .getInstalledPlugins()
        .some((p) => p.manifest.id === pluginId)
    },
    [pluginManager],
  )

  const hasRequiredConfig = (manifest: PluginManifest) =>
    Object.values(manifest.config).some((f) => f.required)

  const getConfigDraft = (
    pluginId: string,
    manifest: PluginManifest,
  ): Record<string, unknown> => {
    if (configDrafts[pluginId]) return configDrafts[pluginId]
    const saved = statesMap[pluginId]?.config ?? {}
    const draft: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(manifest.config)) {
      draft[key] =
        saved[key] ?? field.default ?? (field.type === 'boolean' ? false : '')
    }
    return draft
  }

  const updateDraft = (pluginId: string, key: string, value: unknown) => {
    setConfigDrafts((prev) => {
      const installed = pluginManager.getInstalledPlugins()
      const plugin = installed.find((p) => p.manifest.id === pluginId)
      const manifest = plugin?.manifest
      if (!manifest) return prev
      return {
        ...prev,
        [pluginId]: { ...getConfigDraft(pluginId, manifest), [key]: value },
      }
    })
  }

  const setPluginFeedback = (
    pluginId: string,
    type: 'error' | 'success',
    message: string,
  ) => {
    setFeedback((prev) => ({ ...prev, [pluginId]: { type, message } }))
  }

  const clearPluginFeedback = (pluginId: string) => {
    setFeedback((prev) => {
      const next = { ...prev }
      delete next[pluginId]
      return next
    })
  }

  /** Find the Registry entry for a given plugin ID. */
  const findRegistryEntry = useCallback(
    (pluginId: string): RegistryPluginEntry | undefined => {
      return (registryQuery.data?.plugins ?? []).find(
        (e) => e.manifest.id === pluginId,
      )
    },
    [registryQuery.data],
  )

  /** Install a remote plugin: fetch module from Registry, evaluate, install + activate. */
  const installRemotePlugin = async (entry: RegistryPluginEntry) => {
    const id = entry.manifest.id
    if (installInFlight.current.has(id)) return
    installInFlight.current.add(id)

    try {
      const loader = moduleLoaderRef.current!

      // Try sandboxed (default). If the plugin needs the main realm (UI
      // contributions), ask for explicit full-trust consent and retry.
      let trust: PluginTrustLevel = 'sandboxed'
      let pluginModule
      try {
        pluginModule = await loader.fetchAndCache(entry)
      } catch (err) {
        if (!(err instanceof PluginFullTrustRequiredError)) throw err
        // Community plugins are permanently sandbox-only — never offer the
        // full-trust grant. (The loader independently clamps community-signed
        // code to the sandbox, so this is UX, not the enforcement.)
        if (isCommunityEntry(entry)) {
          await loader.evict(entry.manifest.id)
          throw new Error(
            t(
              'pluginStore.communityFullTrustBlocked',
              'Community plugins always run sandboxed. "{{name}}" requires main-app privileges, so it cannot be installed.',
              { name: entry.manifest.name },
            ),
          )
        }
        const granted = await requestFullTrust({
          name: entry.manifest.name,
          author: entry.manifest.author,
        })
        if (!granted) {
          // Declined: leave nothing behind — evict the cached code so the
          // plugin is simply not installed and can be tried again later.
          await loader.evict(entry.manifest.id)
          return
        }
        trust = 'full'
        pluginModule = await loader.fetchAndCache(entry, 'full')
      }

      if (pluginModule.manifest.id !== entry.manifest.id) {
        await loader.evict(entry.manifest.id)
        throw new Error(
          `Plugin ID mismatch: registry says "${entry.manifest.id}" but module declares "${pluginModule.manifest.id}"`,
        )
      }

      // Install into PluginManager
      await pluginManager.installPlugin(
        pluginModule.manifest,
        pluginModule.factory,
      )

      // Activate
      const config = getConfigDraft(
        pluginModule.manifest.id,
        pluginModule.manifest,
      )
      await pluginManager.activatePlugin(
        pluginModule.manifest.id,
        buildActivationConfig(pluginModule.manifest.id, config),
      )

      // Record in the local ledger (survives reload; works signed-out)
      upsertLedgerEntry({
        pluginId: pluginModule.manifest.id,
        source: 'registry',
        enabled: true,
        config,
        version: pluginModule.manifest.version,
        trust,
      })
      track('plugin_installed', { plugin_id: pluginModule.manifest.id })

      // Persist to App Server (when signed in)
      saveStateMutation.mutate({
        pluginId: pluginModule.manifest.id,
        enabled: true,
        config,
      })

      // Surface any external hosts the plugin needs (desktop only); on consent,
      // persist the grant and reload so the widened CSP applies.
      const consent = await requestAndApplyNetworkConsent(
        pluginModule.manifest,
        requestNetworkConsent,
      )
      if (consent === 'granted') reloadForGrants()
    } finally {
      installInFlight.current.delete(id)
    }
  }

  const handleToggle = async (manifest: PluginManifest, checked: boolean) => {
    clearPluginFeedback(manifest.id)

    // Block activation for platform-incompatible plugins
    if (checked && !isPlatformCompatible(manifest)) {
      const badgeKey = getPlatformBadgeKey(manifest)
      const badge = badgeKey ? t(badgeKey) : ''
      setPluginFeedback(
        manifest.id,
        'error',
        t('pluginStore.platformIncompatible', { badge }),
      )
      return
    }

    setBusyPluginId(manifest.id)
    const isTheme = isThemeManifest(manifest)

    try {
      if (checked) {
        // Check if this is a remote plugin that needs to be fetched first
        if (!isInstalled(manifest.id)) {
          const registryEntry = findRegistryEntry(manifest.id)
          if (registryEntry?.moduleUrl) {
            await installRemotePlugin(registryEntry)
            notifyPluginStateChange()
            setPluginFeedback(
              manifest.id,
              'success',
              t('pluginStore.installed', 'Installed and activated'),
            )
            toast.success(
              t('pluginStore.installedToast', 'Installed & activated'),
              { description: manifest.name },
            )
            setBusyPluginId(null)
            return
          }
        }

        if (hasRequiredConfig(manifest) && !isActive(manifest.id)) {
          // Need config first — open the product page so the form is visible.
          setSelectedEntry(
            findRegistryEntry(manifest.id) ?? manifestToEntry(manifest),
          )
          setBusyPluginId(null)
          return
        } else {
          const config = getConfigDraft(manifest.id, manifest)
          await pluginManager.activatePlugin(
            manifest.id,
            buildActivationConfig(manifest.id, config),
          )
          setLedgerEnabled(manifest.id, true)
          setLedgerConfig(manifest.id, config)
          track('plugin_toggled', { plugin_id: manifest.id, enabled: true })
          saveStateMutation.mutate({
            pluginId: manifest.id,
            enabled: true,
            config,
          })
        }
        notifyPluginStateChange()
        setPluginFeedback(manifest.id, 'success', t('pluginStore.activated'))
        toast.success(
          isTheme
            ? t('pluginStore.themeAppliedToast', 'Theme applied')
            : t('pluginStore.installedToast', 'Installed & activated'),
          { description: manifest.name },
        )
      } else {
        // Deactivate — for remote plugins, also uninstall + evict cache
        const registryEntry = findRegistryEntry(manifest.id)
        const isRemote = registryEntry?.moduleUrl && !registryEntry.bundled

        await pluginManager.deactivatePlugin(manifest.id)

        if (isRemote) {
          await pluginManager.uninstallPlugin(manifest.id)
          await moduleLoaderRef.current!.evict(manifest.id)
          removeFromLedger(manifest.id)
          api.removePluginState(manifest.id).catch(() => {})
          track('plugin_uninstalled', { plugin_id: manifest.id })
        } else {
          const savedConfig = statesMap[manifest.id]?.config ?? {}
          setLedgerEnabled(manifest.id, false)
          track('plugin_toggled', { plugin_id: manifest.id, enabled: false })
          saveStateMutation.mutate({
            pluginId: manifest.id,
            enabled: false,
            config: savedConfig,
          })
        }

        notifyPluginStateChange()
        setPluginFeedback(
          manifest.id,
          'success',
          isRemote
            ? t('pluginStore.uninstalled', 'Uninstalled')
            : t('pluginStore.deactivated'),
        )
      }
    } catch (err) {
      setPluginFeedback(
        manifest.id,
        'error',
        err instanceof Error ? err.message : t('pluginStore.operationFailed'),
      )
    } finally {
      setBusyPluginId(null)
    }
  }

  const handleConfigSubmit = async (
    event: FormEvent,
    manifest: PluginManifest,
  ) => {
    event.preventDefault()
    clearPluginFeedback(manifest.id)

    // Block activation for platform-incompatible plugins
    if (!isPlatformCompatible(manifest)) {
      const badgeKey = getPlatformBadgeKey(manifest)
      const badge = badgeKey ? t(badgeKey) : ''
      setPluginFeedback(
        manifest.id,
        'error',
        t('pluginStore.platformIncompatible', { badge }),
      )
      return
    }

    setBusyPluginId(manifest.id)

    try {
      const config = getConfigDraft(manifest.id, manifest)

      for (const [key, field] of Object.entries(manifest.config)) {
        if (field.required && !config[key]) {
          setPluginFeedback(manifest.id, 'error', `${field.label} is required`)
          setBusyPluginId(null)
          return
        }
      }

      if (isActive(manifest.id)) {
        await pluginManager.deactivatePlugin(manifest.id)
      }

      await pluginManager.activatePlugin(
        manifest.id,
        buildActivationConfig(manifest.id, config),
      )
      setLedgerEnabled(manifest.id, true)
      setLedgerConfig(manifest.id, config)
      track('plugin_toggled', { plugin_id: manifest.id, enabled: true })
      saveStateMutation.mutate({
        pluginId: manifest.id,
        enabled: true,
        config,
      })
      notifyPluginStateChange()
      setPluginFeedback(
        manifest.id,
        'success',
        t('pluginStore.activatedWithConfig'),
      )
    } catch (err) {
      setPluginFeedback(
        manifest.id,
        'error',
        err instanceof Error ? err.message : t('pluginStore.activationFailed'),
      )
    } finally {
      setBusyPluginId(null)
    }
  }

  // Build plugin entries list — merge registry with installed
  const entries: Array<RegistryPluginEntry> = useMemo(() => {
    if (registryOffline) {
      // Fallback: show installed plugins as synthetic entries
      return pluginManager
        .getInstalledPlugins()
        .map((p) => manifestToEntry(p.manifest))
    }

    const registryPlugins = registryQuery.data?.plugins ?? []

    const registryIds = new Set(registryPlugins.map((e) => e.manifest.id))
    const installed = pluginManager.getInstalledPlugins()
    const extras = installed
      .filter((p) => !registryIds.has(p.manifest.id))
      .map((p) => manifestToEntry(p.manifest))

    // When a category filter is active, only include extras that match it
    if (categoryFilter) {
      const matchingExtras = extras.filter((e) => e.category === categoryFilter)
      return [...registryPlugins, ...matchingExtras]
    }

    return [...registryPlugins, ...extras]
  }, [registryOffline, registryQuery.data, pluginManager, categoryFilter])

  const query = search.trim().toLowerCase()
  const searching = query.length > 0

  const matchesQuery = useCallback(
    (e: RegistryPluginEntry) =>
      !query ||
      e.manifest.name.toLowerCase().includes(query) ||
      pluginTitle(e.manifest).toLowerCase().includes(query) ||
      pluginDescription(e.manifest).toLowerCase().includes(query) ||
      e.tagline.toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query),
    [query],
  )

  const filteredEntries = useMemo(
    () => entries.filter(matchesQuery),
    [entries, matchesQuery],
  )

  const categories = registryQuery.data?.categories ?? []
  const featured = useMemo(
    () => (featuredQuery.data?.plugins ?? []).slice(0, 4),
    [featuredQuery.data],
  )

  // Category text arrives from the registry in English. Categories are our
  // content, not a plugin author's, so their translations live in the catalog
  // like the rest of ours — keyed by the id the server already sends, with the
  // server's own string as the fallback. No server change, and an older
  // registry keeps working.
  const categoryLabel = useCallback(
    (categoryId: string) => {
      const meta = categories.find((c: RegistryCategory) => c.id === categoryId)
      return t(`registryCategories.${categoryId}.label`, {
        defaultValue:
          meta?.label ??
          categoryId.charAt(0).toUpperCase() + categoryId.slice(1),
      })
    },
    [categories, t],
  )

  const categoryDescription = useCallback(
    (categoryId: string, fallback: string | undefined) =>
      fallback === undefined
        ? undefined
        : t(`registryCategories.${categoryId}.description`, {
            defaultValue: fallback,
          }),
    [t],
  )

  // Topic shelves: one per registry category (ordered), Editor's picks first.
  const shelves = useMemo(() => {
    if (categoryFilter) return []
    const catMap = new Map<string, Array<RegistryPluginEntry>>()
    for (const entry of filteredEntries) {
      const cat = entry.category || 'other'
      if (!catMap.has(cat)) catMap.set(cat, [])
      catMap.get(cat)!.push(entry)
    }
    const catOrder = categories.map((c: RegistryCategory) => c.id)
    const sorted = [...catMap.entries()].sort((a, b) => {
      const ai = catOrder.indexOf(a[0])
      const bi = catOrder.indexOf(b[0])
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    return sorted.map(([catId, plugins]) => {
      const catMeta = categories.find((c: RegistryCategory) => c.id === catId)
      return {
        id: catId,
        label: categoryLabel(catId),
        subLabel: categoryDescription(catId, catMeta?.description),
        plugins,
      }
    })
  }, [
    categoryFilter,
    filteredEntries,
    categories,
    categoryLabel,
    categoryDescription,
  ])

  const editorsPicks = useMemo(
    () => featured.filter(matchesQuery),
    [featured, matchesQuery],
  )

  const noResults =
    searching &&
    !registryQuery.isLoading &&
    filteredEntries.length === 0 &&
    editorsPicks.length === 0

  const openProductPage = useCallback(
    (entry: RegistryPluginEntry, layoutId?: string) => {
      setPosterLayoutId(layoutId ?? null)
      setSelectedEntry(entry)
    },
    [],
  )

  // Shelf-scoped shared-element ids: the same plugin can sit on several
  // shelves at once, and duplicate layoutIds would confuse the morph.
  const renderCard = (entry: RegistryPluginEntry, shelfKey: string) => {
    const layoutId = reduceMotion
      ? undefined
      : `plugin-poster-${shelfKey}-${entry.manifest.id}`
    return entry.category === 'themes' ? (
      <ThemeStoreCard
        key={entry.manifest.id}
        entry={entry}
        active={isActive(entry.manifest.id)}
        layoutId={layoutId}
        onClick={() => openProductPage(entry, layoutId)}
      />
    ) : (
      <PluginStoreCard
        key={entry.manifest.id}
        entry={entry}
        installed={isInstalled(entry.manifest.id)}
        active={isActive(entry.manifest.id)}
        installing={busyPluginId === entry.manifest.id}
        platformBadge={resolvePlatformBadge(entry.manifest)}
        layoutId={layoutId}
        onClick={() => openProductPage(entry, layoutId)}
      />
    )
  }

  return (
    <div className="relative h-full">
      <StoreAurora />

      {/* Store body */}
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="mx-auto max-w-[1180px] px-[30px] pb-10 pt-6">
          {/* Registry offline banner */}
          {registryOffline && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                {t('pluginStore.registryOffline')}
              </AlertDescription>
            </Alert>
          )}

          {/* Spotlight hero */}
          {!searching && !categoryFilter && (
            <>
              {featuredQuery.isLoading && <FeaturedHeroSkeleton />}
              {featured.length > 0 && (
                <SpotlightHero
                  entries={featured}
                  categoryLabel={categoryLabel}
                  isActive={isActive}
                  busyPluginId={busyPluginId}
                  paused={!!selectedEntry}
                  onInstall={(entry) => void handleToggle(entry.manifest, true)}
                  onDetails={openProductPage}
                />
              )}
            </>
          )}

          {/* Loading shelves */}
          {registryQuery.isLoading && (
            <>
              <ShelfSkeleton />
              <ShelfSkeleton />
            </>
          )}

          {/* Category "Show all" view */}
          {categoryFilter && !registryQuery.isLoading && (
            <section>
              <button
                type="button"
                onClick={() => setCategoryFilter(undefined)}
                className="mb-5 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
                {t('pluginStore.backToStore', 'Store')}
              </button>
              <h2 className="font-serif text-[28px] font-semibold tracking-[-0.02em]">
                {categoryLabel(categoryFilter)}
              </h2>
              <div className="mt-6 flex flex-wrap gap-4">
                {filteredEntries.map((e) => renderCard(e, 'all'))}
              </div>
            </section>
          )}

          {/* Topic shelves */}
          {!categoryFilter && !registryQuery.isLoading && (
            <>
              {editorsPicks.length > 0 && (
                <StoreShelf
                  label={t('pluginStore.editorsPicks', "Editor's picks")}
                  subLabel={t('pluginStore.curated', 'Curated this week')}
                  showAllLabel={t('pluginStore.showMore', 'Show all')}
                  className={searching ? 'mt-2' : undefined}
                >
                  {editorsPicks.map((e) => renderCard(e, 'picks'))}
                </StoreShelf>
              )}
              {shelves.map((shelf) => (
                <StoreShelf
                  key={shelf.id}
                  label={shelf.label}
                  subLabel={shelf.subLabel}
                  onShowAll={() => setCategoryFilter(shelf.id)}
                  showAllLabel={t('pluginStore.showMore', 'Show all')}
                >
                  {shelf.plugins.map((e) => renderCard(e, shelf.id))}
                  {registryQuery.isFetching && shelf.plugins.length === 0 && (
                    <PosterCardSkeleton />
                  )}
                </StoreShelf>
              ))}
            </>
          )}

          {noResults && (
            <p className="py-24 text-center text-sm text-muted-foreground">
              {t('pluginStore.noMatches', {
                defaultValue: 'No plugins match “{{query}}”.',
                query: search.trim(),
              })}
            </p>
          )}
        </div>
      </div>

      {/* Full-screen product page */}
      <AnimatePresence>
        {selectedEntry && (
          <PluginProductPage
            key={selectedEntry.manifest.id}
            entry={selectedEntry}
            posterLayoutId={posterLayoutId}
            categoryLabel={categoryLabel}
            active={isActive(selectedEntry.manifest.id)}
            busy={busyPluginId === selectedEntry.manifest.id}
            feedback={feedback[selectedEntry.manifest.id] ?? null}
            savedConfig={statesMap[selectedEntry.manifest.id]?.config ?? null}
            configDraft={getConfigDraft(
              selectedEntry.manifest.id,
              selectedEntry.manifest,
            )}
            platformBadge={resolvePlatformBadge(selectedEntry.manifest)}
            onBack={() => setSelectedEntry(null)}
            onToggle={(checked) =>
              void handleToggle(selectedEntry.manifest, checked)
            }
            onConfigChange={(key, value) =>
              updateDraft(selectedEntry.manifest.id, key, value)
            }
            onConfigSubmit={(e) =>
              void handleConfigSubmit(e, selectedEntry.manifest)
            }
          />
        )}
      </AnimatePresence>

      {fullTrustDialog}
      {networkConsentDialog}
    </div>
  )
}
