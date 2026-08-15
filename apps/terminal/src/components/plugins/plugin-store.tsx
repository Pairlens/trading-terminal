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
import { ConfirmUninstallDialog } from './confirm-uninstall-dialog'
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
  setLedgerConfig,
  setLedgerEnabled,
  upsertLedgerEntry,
} from '@/lib/plugins/plugin-ledger'
import { buildActivationConfig } from '@/lib/plugins/official-config'
import {
  findOfferableBundledManifest,
  listOfferableBundledManifests,
} from '@/lib/plugins/offerable-bundled'
import { isThemeManifest, manifestToEntry } from '@/lib/plugins/plugin-entry'
import {
  isReinstallableBundledPlugin,
  reinstallBundledPlugin,
} from '@/lib/plugins/bootstrap-reinstall'
import {
  PluginUninstallRefusedError,
  canUninstallPlugin,
  uninstallPluginEverywhere,
} from '@/lib/plugins/uninstall-plugin'
import {
  reloadForGrants,
  requestAndApplyNetworkConsent,
} from '@/lib/plugins/network-grants'
import { isCommunityEntry } from '@/lib/plugins/community-tier'
import { isFamilyExcluded } from '@/lib/plugins/plugin-families'
import {
  PluginFullTrustRequiredError,
  PluginModuleLoader,
} from '@/lib/plugins/plugin-module-loader'
import { usePairlens } from '@/lib/pairlens-provider'
import { useThemePluginContext } from '@/hooks/use-theme-plugin'
import { pluginDescription, pluginTitle } from '@/lib/plugin-text'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlatformCompatible(_manifest: PluginManifest): boolean {
  return true
}

function getPlatformBadgeKey(
  _manifest: PluginManifest,
): 'pluginStore.desktopOnly' | 'pluginStore.browserOnly' | null {
  return null
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
  const { pluginManager, pluginStateVersion, notifyPluginStateChange } =
    usePairlens()
  // A theme plugin being *active* only means its tokens are available — the
  // one that actually paints the terminal is `activeThemeId`. The store speaks
  // in "applied", so it reads and writes that selection directly instead of
  // sending the user to Settings → Appearance.
  const { activeThemeId, selectTheme } = useThemePluginContext()
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

  // Auto-open the product page when ?manage=pluginId is present. A bundled
  // plugin the user uninstalled has no manager entry, so fall back to its
  // shipped manifest — otherwise the deep link lands on the shelves with no
  // explanation, which is exactly the plugin the user asked to see.
  useEffect(() => {
    if (!autoOpenPluginId) return
    const installedManifest = pluginManager
      .getInstalledPlugins()
      .find((p) => p.manifest.id === autoOpenPluginId)?.manifest
    const manifest = installedManifest
      ? isFamilyExcluded(installedManifest)
        ? null
        : installedManifest
      : findOfferableBundledManifest(autoOpenPluginId)
    if (manifest) setSelectedEntry(manifestToEntry(manifest))
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
  // The manifest, not an id: the product page behind the dialog can change
  // while it is open, and confirming must remove what the user was looking at.
  const [confirmUninstall, setConfirmUninstall] =
    useState<PluginManifest | null>(null)

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

  /**
   * A required field the user has not filled in yet. Activating in that state
   * throws from inside the connector (an Alpaca install with no API keys), so
   * the install flow stops and opens the config form instead of surfacing a
   * raw error.
   */
  const needsConfigInput = (manifest: PluginManifest): boolean => {
    if (!hasRequiredConfig(manifest)) return false
    const draft = getConfigDraft(manifest.id, manifest)
    return Object.entries(manifest.config).some(
      ([key, field]) => field.required && !draft[key],
    )
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
        if (!isInstalled(manifest.id)) {
          // Bundled plugins install from the compiled-in bundle, never from
          // the registry: downloading one would rewrite its ledger source to
          // 'registry' and it would stop being a built-in for good.
          if (isReinstallableBundledPlugin(manifest.id)) {
            // A connector whose API keys are still missing comes back
            // installed but not started: activating it would throw from
            // inside the plugin. The config form takes it from there and
            // activates on save, exactly like the enable path below.
            const awaitingConfig = needsConfigInput(manifest)
            await reinstallBundledPlugin({
              manager: pluginManager,
              pluginId: manifest.id,
              activate: !awaitingConfig,
              persistState: (data) => saveStateMutation.mutate(data),
            })
            notifyPluginStateChange()
            if (awaitingConfig) {
              setSelectedEntry(
                findRegistryEntry(manifest.id) ?? manifestToEntry(manifest),
              )
              setBusyPluginId(null)
              return
            }
            setPluginFeedback(
              manifest.id,
              'success',
              t('pluginStore.installedActive'),
            )
            toast.success(
              t('pluginStore.installedToast', 'Installed & activated'),
              { description: manifest.name },
            )
            setBusyPluginId(null)
            return
          }

          // Otherwise: a remote plugin that needs to be fetched first
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
        // Disable means disable, for every source alike. Removing a plugin for
        // good is its own action now (handleUninstall), so turning a registry
        // plugin off no longer silently deletes it.
        //
        // A theme being switched off while it paints the terminal has to hand
        // the palette back first — the plugin is about to stop answering for it.
        if (isTheme && activeThemeId === manifest.id) {
          selectTheme(null)
          track('theme_changed', { theme: 'default' })
        }

        await pluginManager.deactivatePlugin(manifest.id)

        const savedConfig = statesMap[manifest.id]?.config ?? {}
        setLedgerEnabled(manifest.id, false)
        track('plugin_toggled', { plugin_id: manifest.id, enabled: false })
        saveStateMutation.mutate({
          pluginId: manifest.id,
          enabled: false,
          config: savedConfig,
        })

        notifyPluginStateChange()
        setPluginFeedback(manifest.id, 'success', t('pluginStore.deactivated'))
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

  /**
   * Remove a plugin for good, from the same page that installed it. Bundled
   * plugins leave a ledger tombstone so boot skips them; the Store keeps
   * listing them with an Install action, which is what makes dropping a whole
   * asset class (uninstall the family's connectors and its panel plugin) a
   * reversible decision rather than a one-way door.
   */
  const handleUninstall = async (manifest: PluginManifest) => {
    clearPluginFeedback(manifest.id)
    setBusyPluginId(manifest.id)
    try {
      // A theme painting the terminal hands the palette back on the way out —
      // `uninstallPluginEverywhere` owns that, so both surfaces get it.
      await uninstallPluginEverywhere({
        manager: pluginManager,
        pluginId: manifest.id,
        moduleLoader: moduleLoaderRef.current,
      })
      notifyPluginStateChange()
      setPluginFeedback(manifest.id, 'success', t('pluginStore.uninstalled'))
      toast.success(t('pluginStore.uninstalledToast'), {
        description: manifest.name,
      })
    } catch (err) {
      setPluginFeedback(
        manifest.id,
        'error',
        err instanceof PluginUninstallRefusedError
          ? t('pluginStore.uninstallRefusedCore')
          : err instanceof Error
            ? err.message
            : t('pluginStore.operationFailed'),
      )
    } finally {
      setBusyPluginId(null)
      setConfirmUninstall(null)
    }
  }

  /**
   * Apply a theme straight from its store page: install it if it came from the
   * registry, activate the plugin if it is dormant, then select it as the
   * terminal's theme. Without the last step "installed" themes just sit in the
   * Settings picker, which is the trip this replaces.
   */
  const handleApplyTheme = async (manifest: PluginManifest) => {
    clearPluginFeedback(manifest.id)
    setBusyPluginId(manifest.id)

    try {
      if (!isInstalled(manifest.id)) {
        if (isReinstallableBundledPlugin(manifest.id)) {
          // A bundled theme the user uninstalled comes straight back from the
          // binary — applying it is one click, not a trip through the registry.
          await reinstallBundledPlugin({
            manager: pluginManager,
            pluginId: manifest.id,
            persistState: (data) => saveStateMutation.mutate(data),
          })
          notifyPluginStateChange()
        } else {
          const registryEntry = findRegistryEntry(manifest.id)
          if (registryEntry?.moduleUrl) {
            await installRemotePlugin(registryEntry)
            notifyPluginStateChange()
            // Consent was declined — installRemotePlugin leaves nothing behind,
            // and the user already answered, so say nothing more.
            if (!isInstalled(manifest.id)) return
          }
        }
      }

      // A theme the user had switched off is dormant, not gone: wake it back
      // up rather than making them find it in the Installed tab first.
      if (!isActive(manifest.id)) {
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
        notifyPluginStateChange()
      }

      selectTheme(manifest.id)
      track('theme_changed', { theme: manifest.id })
      setPluginFeedback(manifest.id, 'success', t('pluginStore.applied'))
      toast.success(t('pluginStore.themeAppliedToast', 'Theme applied'), {
        description: manifest.name,
      })
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

  /** Drop back to the built-in palette. The plugin stays installed so the
   *  theme is one click away again. */
  const handleRemoveTheme = (manifest: PluginManifest) => {
    clearPluginFeedback(manifest.id)
    selectTheme(null)
    track('theme_changed', { theme: 'default' })
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

  // Build plugin entries list — merge registry with installed, and with the
  // bundled plugins the user has uninstalled. Those still ship in the binary,
  // so the Store is where they come back: without them here, uninstalling a
  // built-in connector made it invisible whenever the registry was offline and
  // "Reset to defaults" was the only way to recover it.
  // Families this deployment excluded are not offered: the registry still
  // advertises them (it is shared across deployments), so they are dropped
  // here. Only bundled plugins are ever family-filtered.
  // The installed set as a stable primitive: `pluginStateVersion` bumps once
  // per plugin during boot, and re-mapping all ~60 bundled manifests on each
  // of those bumps is pure waste when the set of *ids* has not moved.
  const installedIdsKey = useMemo(
    () =>
      pluginManager
        .getInstalledPlugins()
        .map((p) => p.manifest.id)
        .sort()
        .join(','),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const offerableBundledEntries: Array<RegistryPluginEntry> = useMemo(() => {
    const installedIds = new Set(
      installedIdsKey.length > 0 ? installedIdsKey.split(',') : [],
    )
    return listOfferableBundledManifests({ excludeIds: installedIds }).map(
      manifestToEntry,
    )
  }, [installedIdsKey])

  const entries: Array<RegistryPluginEntry> = useMemo(() => {
    const local = [
      ...pluginManager
        .getInstalledPlugins()
        .map((p) => manifestToEntry(p.manifest))
        .filter((e) => !isFamilyExcluded(e.manifest)),
      ...offerableBundledEntries,
    ]

    if (registryOffline) return local

    const registryPlugins = (registryQuery.data?.plugins ?? []).filter(
      (e) => !isFamilyExcluded(e.manifest),
    )

    const registryIds = new Set(registryPlugins.map((e) => e.manifest.id))
    const extras = local.filter((e) => !registryIds.has(e.manifest.id))

    // When a category filter is active, only include extras that match it
    if (categoryFilter) {
      const matchingExtras = extras.filter((e) => e.category === categoryFilter)
      return [...registryPlugins, ...matchingExtras]
    }

    return [...registryPlugins, ...extras]
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [
    registryOffline,
    registryQuery.data,
    pluginManager,
    pluginStateVersion,
    offerableBundledEntries,
    categoryFilter,
  ])

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
    () =>
      (featuredQuery.data?.plugins ?? [])
        .filter((e) => !isFamilyExcluded(e.manifest))
        .slice(0, 4),
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
        active={activeThemeId === entry.manifest.id}
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
            installed={isInstalled(selectedEntry.manifest.id)}
            themeApplied={activeThemeId === selectedEntry.manifest.id}
            busy={busyPluginId === selectedEntry.manifest.id}
            feedback={feedback[selectedEntry.manifest.id] ?? null}
            savedConfig={statesMap[selectedEntry.manifest.id]?.config ?? null}
            configDraft={getConfigDraft(
              selectedEntry.manifest.id,
              selectedEntry.manifest,
            )}
            platformBadge={resolvePlatformBadge(selectedEntry.manifest)}
            uninstallable={canUninstallPlugin(selectedEntry.manifest.id)}
            onBack={() => setSelectedEntry(null)}
            onToggle={(checked) =>
              void handleToggle(selectedEntry.manifest, checked)
            }
            onUninstall={() => setConfirmUninstall(selectedEntry.manifest)}
            onApplyTheme={() => void handleApplyTheme(selectedEntry.manifest)}
            onRemoveTheme={() => handleRemoveTheme(selectedEntry.manifest)}
            onConfigChange={(key, value) =>
              updateDraft(selectedEntry.manifest.id, key, value)
            }
            onConfigSubmit={(e) =>
              void handleConfigSubmit(e, selectedEntry.manifest)
            }
          />
        )}
      </AnimatePresence>

      {/* Confirm uninstall — the same dialog the Installed tab uses */}
      <ConfirmUninstallDialog
        manifest={confirmUninstall}
        onOpenChange={(open) => {
          if (!open) setConfirmUninstall(null)
        }}
        onConfirm={(manifest) => void handleUninstall(manifest)}
      />

      {fullTrustDialog}
      {networkConsentDialog}
    </div>
  )
}
