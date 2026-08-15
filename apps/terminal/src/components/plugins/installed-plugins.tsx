// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ArrowUpCircle,
  FolderOpen,
  Globe,
  KeyRound,
  Loader2,
  Puzzle,
  RotateCcw,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Switch } from '@pairlens/ui/components/ui/switch'
import { unpackPlugin } from '@pairlens/shared/plugin-package'
import {
  PLUGIN_FAMILIES,
  pluginFamilyOf,
} from '@pairlens/shared/plugin-families'
import { cn } from '@pairlens/ui'
import { useFullTrustConsent } from './full-trust-consent'
import { useNetworkConsent } from './network-consent'
import { useRegistrySettings } from './use-registry-settings'
import { PluginDetailDialog } from './plugin-detail-dialog'
import { PluginIcon } from './plugin-icon'
import type {
  PluginFamilyId,
  PluginFamilyMeta,
} from '@pairlens/shared/plugin-families'
import type { PluginInstance, PluginManifest } from '@pairlens/plugin-system'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'

import type { FormEvent } from 'react'
import type { PluginStateResponse } from '@/lib/api'
import type {
  PluginSourceKind,
  PluginTrustLevel,
} from '@/lib/plugins/plugin-ledger'
import type { PendingTrustEntry } from '@/stores/plugin-pending-trust-store'
import type { PluginUpdateInfo } from '@/stores/plugin-updates-store'
import { track } from '@/lib/analytics-events'
import { missingConfigHint } from '@/lib/plugins/config-requirements'
import { api, queryKeys } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { usePairlens } from '@/lib/pairlens-provider'
import { useThemePluginContext } from '@/hooks/use-theme-plugin'
import { orderForBulkToggle } from '@/lib/plugins/family-toggle-order'
import { BOOTSTRAP_PLUGIN_IDS } from '@/lib/plugins/bootstrap-bundle'
import {
  PluginFullTrustRequiredError,
  PluginModuleLoader,
} from '@/lib/plugins/plugin-module-loader'
import { buildActivationConfig } from '@/lib/plugins/official-config'
import {
  clearTombstonesAndRemoteEntries,
  getLedger,
  getPluginTrust,
  pluginRequiresFullTrust,
  removeFromLedger,
  setLedgerConfig,
  setLedgerEnabled,
  setPluginTrust,
  upsertLedgerEntry,
} from '@/lib/plugins/plugin-ledger'
import {
  hasLocalPluginStore,
  openLocalPluginsDir,
  readLocalPlugin,
  writeLocalPlugin,
} from '@/lib/plugins/local-plugin-store'
import {
  reloadForGrants,
  requestAndApplyNetworkConsent,
  revokeNetworkGrant,
} from '@/lib/plugins/network-grants'
import {
  clearPendingFullTrust,
  getPendingFullTrust,
} from '@/stores/plugin-pending-trust-store'
import {
  addStagedUpdate,
  clearAvailableUpdates,
  clearStagedUpdates,
  getAvailableUpdates,
  removeUpdateForPlugin,
} from '@/stores/plugin-updates-store'
import { pluginDescription, pluginTitle } from '@/lib/plugin-text'

function getContributedPanelCount(plugin: PluginInstance): number {
  return plugin.manifest.contributes?.panels?.length ?? 0
}

function manifestToEntry(manifest: PluginManifest): RegistryPluginEntry {
  const isTheme = manifest.capabilities.some((c) => c.id === 'theme:override')
  return {
    manifest,
    category: isTheme ? 'themes' : 'installed',
    tagline: pluginDescription(manifest),
    bundled: true,
  }
}

export function InstalledPlugins() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { pluginManager, pluginStateVersion, notifyPluginStateChange } =
    usePairlens()
  // Read only: the family bulk toggle needs to know which theme the user
  // picked so it can order the loop around it, never to change the selection.
  const { activeThemeId } = useThemePluginContext()
  const { requestFullTrust, dialog: fullTrustDialog } = useFullTrustConsent()
  const { requestNetworkConsent, dialog: networkConsentDialog } =
    useNetworkConsent()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [configPlugin, setConfigPlugin] = useState<PluginInstance | null>(null)
  const [configDrafts, setConfigDrafts] = useState<
    Record<string, Record<string, unknown>>
  >({})
  const [configFeedback, setConfigFeedback] = useState<
    Record<string, { type: 'error' | 'success'; message: string }>
  >({})

  // Manual install state
  const [manualInstallOpen, setManualInstallOpen] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  // Import (.zip) + drag-drop state
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const isDesktop = hasLocalPluginStore()

  // Strong-confirm before disabling the irreducible core plugin
  const [confirmDisableCore, setConfirmDisableCore] = useState<string | null>(
    null,
  )

  // Module loader for update flow
  const { effectiveUrl } = useRegistrySettings()
  const moduleLoaderRef = useRef<PluginModuleLoader | null>(null)
  if (!moduleLoaderRef.current) {
    moduleLoaderRef.current = new PluginModuleLoader(effectiveUrl)
  }
  moduleLoaderRef.current.setRegistryUrl(effectiveUrl)
  moduleLoaderRef.current.setAuthTokenProvider(async () => {
    const session = await authClient.getSession()
    return session.data?.session?.token ?? ''
  })

  const plugins = useMemo(
    () => pluginManager.getInstalledPlugins(),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginManager, pluginStateVersion],
  )

  const availableUpdates = useMemo(() => {
    const map = new Map<string, PluginUpdateInfo>()
    for (const u of getAvailableUpdates()) map.set(u.pluginId, u)
    return map
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginStateVersion])

  const statesQuery = useQuery({
    queryKey: queryKeys.pluginStates(),
    queryFn: () => api.getPluginStates(),
  })

  const saveStateMutation = useMutation({
    mutationFn: (data: {
      pluginId: string
      enabled: boolean
      config: Record<string, unknown>
    }) => api.setPluginState(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.pluginStates() }),
  })

  /**
   * Toggle one plugin. Returns whether it worked so a bulk caller can report
   * once instead of stacking a toast per member; `quiet` suppresses the
   * per-plugin error for exactly that case.
   */
  const handleToggle = useCallback(
    async (
      plugin: PluginInstance,
      checked: boolean,
      quiet = false,
    ): Promise<boolean> => {
      setBusyId(plugin.manifest.id)
      try {
        if (checked) {
          const savedState = (statesQuery.data ?? []).find(
            (s) => s.pluginId === plugin.manifest.id,
          )
          const config = savedState?.config ?? plugin.config
          await pluginManager.activatePlugin(
            plugin.manifest.id,
            buildActivationConfig(plugin.manifest.id, config),
          )
          setLedgerEnabled(plugin.manifest.id, true)
          track('plugin_toggled', {
            plugin_id: plugin.manifest.id,
            enabled: true,
          })
          saveStateMutation.mutate({
            pluginId: plugin.manifest.id,
            enabled: true,
            config,
          })
        } else {
          await pluginManager.deactivatePlugin(plugin.manifest.id)
          setLedgerEnabled(plugin.manifest.id, false)
          track('plugin_toggled', {
            plugin_id: plugin.manifest.id,
            enabled: false,
          })
          saveStateMutation.mutate({
            pluginId: plugin.manifest.id,
            enabled: false,
            config: plugin.config,
          })
        }
        notifyPluginStateChange()
        return true
      } catch (err) {
        if (!quiet) {
          toast.error(
            t(
              checked
                ? 'pluginStore.toggleFailedEnable'
                : 'pluginStore.toggleFailedDisable',
              { name: plugin.manifest.name },
            ),
            { description: err instanceof Error ? err.message : String(err) },
          )
        }
        return false
      } finally {
        setBusyId(null)
      }
    },
    [
      pluginManager,
      notifyPluginStateChange,
      statesQuery.data,
      saveStateMutation,
      t,
    ],
  )

  const handleRemove = useCallback(
    async (pluginId: string) => {
      setBusyId(pluginId)
      try {
        await pluginManager.uninstallPlugin(pluginId)
        // Tombstone bootstrap plugins (so they don't reappear on boot) or drop
        // the ledger entry for remote/local plugins; evict any cached code.
        removeFromLedger(pluginId)
        track('plugin_uninstalled', { plugin_id: pluginId })
        await moduleLoaderRef.current?.evict(pluginId)
        // Drop any desktop network-egress grant this plugin held.
        void revokeNetworkGrant(pluginId)
        api.removePluginState(pluginId).catch(() => {})
        notifyPluginStateChange()
      } catch {
        // Removal failed
      } finally {
        setBusyId(null)
        setConfirmRemove(null)
      }
    },
    [pluginManager, notifyPluginStateChange],
  )

  const handleUpdate = useCallback(
    async (update: PluginUpdateInfo) => {
      setBusyId(update.pluginId)
      try {
        const loader = moduleLoaderRef.current!
        // Build a minimal RegistryPluginEntry for fetchAndCache
        const plugin = pluginManager
          .getInstalledPlugins()
          .find((p) => p.manifest.id === update.pluginId)
        if (!plugin) return

        await loader.fetchAndCache({
          // New version: signature binds {id, version, content hashes}.
          manifest: { ...plugin.manifest, version: update.latestVersion },
          category: '',
          tagline: '',
          moduleUrl: update.moduleUrl,
          moduleHash: update.moduleHash,
          styleUrl: update.styleUrl,
          styleHash: update.styleHash,
          signature: update.signature,
          publisherKeyId: update.publisherKeyId,
        })

        addStagedUpdate({
          pluginId: update.pluginId,
          version: update.latestVersion,
          stagedAt: Date.now(),
        })
        removeUpdateForPlugin(update.pluginId)
        notifyPluginStateChange()

        toast.info(t('pluginStore.updateStagedToast'), {
          action: {
            label: t('pluginStore.restartNow'),
            onClick: () => window.location.reload(),
          },
        })
      } catch (err) {
        toast.error(
          t('pluginStore.updateStageFailedToast', {
            error:
              err instanceof Error ? err.message : t('common.unknownError'),
          }),
        )
      } finally {
        setBusyId(null)
      }
    },
    [pluginManager, notifyPluginStateChange, t],
  )

  const handleReset = useCallback(async () => {
    setBusyId('__reset__')
    try {
      const installed = pluginManager.getInstalledPlugins()
      const loader = moduleLoaderRef.current!

      for (const plugin of installed) {
        if (BOOTSTRAP_PLUGIN_IDS.has(plugin.manifest.id)) continue
        try {
          await pluginManager.uninstallPlugin(plugin.manifest.id)
          await loader.evict(plugin.manifest.id)
          api.removePluginState(plugin.manifest.id).catch(() => {})
        } catch {
          // Best-effort removal
        }
      }

      // Restore the default plugin set: clear tombstones (re-enable any
      // uninstalled built-ins) and drop all remote/local ledger entries.
      clearTombstonesAndRemoteEntries()
      clearStagedUpdates()
      clearAvailableUpdates()
      notifyPluginStateChange()

      toast.info(t('pluginStore.resetStagedToast'), {
        action: {
          label: t('pluginStore.restartNow'),
          onClick: () => window.location.reload(),
        },
      })
    } finally {
      setBusyId(null)
      setConfirmReset(false)
    }
  }, [pluginManager, notifyPluginStateChange, t])

  // After a plugin installs, surface any external hosts it needs (desktop only)
  // and, on consent, persist the grant and reload so the widened CSP applies.
  const applyNetworkConsent = useCallback(
    async (manifest: PluginManifest) => {
      const outcome = await requestAndApplyNetworkConsent(
        manifest,
        requestNetworkConsent,
      )
      if (outcome === 'granted') {
        toast.success(
          t('pluginStore.networkGrantedToast', { name: manifest.name }),
        )
        reloadForGrants()
      } else if (outcome === 'denied') {
        toast.warning(
          t('pluginStore.networkDeniedToast', { name: manifest.name }),
        )
      }
    },
    [requestNetworkConsent, t],
  )

  const handleManualInstall = useCallback(async () => {
    const url = manualUrl.trim()
    if (!url) return

    setManualBusy(true)
    try {
      const loader = moduleLoaderRef.current!

      let trust: PluginTrustLevel = 'sandboxed'
      let pluginModule
      try {
        pluginModule = await loader.fetchFromUrl(url)
      } catch (err) {
        if (!(err instanceof PluginFullTrustRequiredError)) throw err
        const granted = await requestFullTrust({ name: url })
        if (!granted) {
          toast.info(t('pluginStore.installCancelledNoTrust'))
          return
        }
        trust = 'full'
        pluginModule = await loader.fetchFromUrl(url, 'full')
      }

      // Install into PluginManager
      await pluginManager.installPlugin(
        pluginModule.manifest,
        pluginModule.factory,
      )

      // Activate with default config
      const defaultConfig: Record<string, unknown> = {}
      for (const [key, field] of Object.entries(pluginModule.manifest.config)) {
        defaultConfig[key] =
          field.default ?? (field.type === 'boolean' ? false : '')
      }
      await pluginManager.activatePlugin(
        pluginModule.manifest.id,
        buildActivationConfig(pluginModule.manifest.id, defaultConfig),
      )

      // Record in the local ledger (source: manual URL)
      upsertLedgerEntry({
        pluginId: pluginModule.manifest.id,
        source: 'url',
        enabled: true,
        config: defaultConfig,
        version: pluginModule.manifest.version,
        trust,
      })
      track('plugin_installed', { plugin_id: pluginModule.manifest.id })

      // Persist state
      saveStateMutation.mutate({
        pluginId: pluginModule.manifest.id,
        enabled: true,
        config: defaultConfig,
      })

      notifyPluginStateChange()
      setManualInstallOpen(false)
      setManualUrl('')

      toast.success(
        t('pluginStore.installedVersionToast', {
          name: pluginModule.manifest.name,
          version: pluginModule.manifest.version,
        }),
      )

      await applyNetworkConsent(pluginModule.manifest)
    } catch (err) {
      toast.error(
        t('pluginStore.installFailedToast', {
          error: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      )
    } finally {
      setManualBusy(false)
    }
  }, [
    manualUrl,
    pluginManager,
    notifyPluginStateChange,
    saveStateMutation,
    applyNetworkConsent,
    t,
  ])

  // ── Recovery: plugins stuck needing full trust ────────────────────
  // (installed but can't load sandboxed — e.g. a pre-sandbox install).
  const pendingTrust = useMemo<Array<PendingTrustEntry>>(
    () => getPendingFullTrust(),
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginStateVersion],
  )

  const handleGrantPendingTrust = useCallback(
    async (entry: PendingTrustEntry) => {
      const granted = await requestFullTrust({ name: entry.pluginId })
      if (!granted) return
      setBusyId(entry.pluginId)
      try {
        setPluginTrust(entry.pluginId, 'full')
        const loader = moduleLoaderRef.current!
        let mod
        if (entry.source === 'local') {
          const files = await readLocalPlugin(entry.pluginId)
          if (!files) throw new Error(t('pluginStore.localFilesNotFound'))
          mod = await loader.loadModuleWithStyle(
            files.module_text,
            files.style_text,
            entry.pluginId,
            'full',
          )
        } else {
          mod = await loader.loadCached(entry.pluginId, 'full')
        }
        if (!mod) throw new Error(t('pluginStore.pluginCodeNotFound'))

        await pluginManager.installPlugin(mod.manifest, mod.factory)
        const cfg = getLedger()[entry.pluginId]?.config ?? {}
        await pluginManager.activatePlugin(
          entry.pluginId,
          buildActivationConfig(entry.pluginId, cfg),
        )
        clearPendingFullTrust(entry.pluginId)
        notifyPluginStateChange()
        toast.success(
          t('pluginStore.fullTrustGrantedNameToast', {
            name: mod.manifest.name,
          }),
        )
      } catch (err) {
        // Revert trust so it doesn't silently sit half-granted.
        setPluginTrust(entry.pluginId, 'sandboxed')
        toast.error(
          t('pluginStore.loadPluginFailedToast', {
            error:
              err instanceof Error ? err.message : t('common.unknownError'),
          }),
        )
      } finally {
        setBusyId(null)
      }
    },
    [requestFullTrust, pluginManager, notifyPluginStateChange, t],
  )

  // ── Import a .zip plugin package (file picker / drag-drop) ─────────

  const handleImportBytes = useCallback(
    async (bytes: Uint8Array, label: string) => {
      setImportBusy(true)
      try {
        const loader = moduleLoaderRef.current!
        // Validate + extract the package up front (clear errors on bad zips).
        const pkg = unpackPlugin(bytes)
        const id = pkg.manifest.id

        // Reinstall cleanly if a plugin with this id already exists.
        if (
          pluginManager.getInstalledPlugins().some((p) => p.manifest.id === id)
        ) {
          await pluginManager.uninstallPlugin(id)
        }

        const onDesktop = hasLocalPluginStore()
        const evaluate = (trust?: PluginTrustLevel) =>
          onDesktop
            ? loader.loadModuleWithStyle(
                pkg.moduleText,
                pkg.styleText,
                id,
                trust,
              )
            : loader.loadPackageBytes(
                bytes,
                { type: 'manual', url: label },
                trust,
              )

        let trust: PluginTrustLevel = 'sandboxed'
        let pluginModule
        try {
          pluginModule = await evaluate()
        } catch (err) {
          if (!(err instanceof PluginFullTrustRequiredError)) throw err
          const granted = await requestFullTrust({
            name: pkg.manifest.name,
            author: pkg.manifest.author,
          })
          if (!granted) {
            toast.info(t('pluginStore.installCancelledNoTrust'))
            return
          }
          trust = 'full'
          pluginModule = await evaluate('full')
        }

        await pluginManager.installPlugin(
          pluginModule.manifest,
          pluginModule.factory,
        )

        const defaultConfig: Record<string, unknown> = {}
        for (const [key, field] of Object.entries(pkg.manifest.config)) {
          defaultConfig[key] =
            field.default ?? (field.type === 'boolean' ? false : '')
        }
        await pluginManager.activatePlugin(
          id,
          buildActivationConfig(id, defaultConfig),
        )

        // On desktop, write the folder so it is the source of truth on disk.
        if (onDesktop) {
          await writeLocalPlugin({
            id,
            manifest: JSON.stringify(pkg.manifest, null, 2),
            moduleText: pkg.moduleText,
            styleText: pkg.styleText,
          })
        }

        upsertLedgerEntry({
          pluginId: id,
          source: onDesktop ? 'local' : 'url',
          enabled: true,
          config: defaultConfig,
          version: pkg.manifest.version,
          trust,
        })
        track('plugin_installed', { plugin_id: id })
        saveStateMutation.mutate({
          pluginId: id,
          enabled: true,
          config: defaultConfig,
        })

        notifyPluginStateChange()
        toast.success(
          t('pluginStore.installedVersionToast', {
            name: pkg.manifest.name,
            version: pkg.manifest.version,
          }),
        )

        await applyNetworkConsent(pluginModule.manifest)
      } catch (err) {
        toast.error(
          t('pluginStore.importFailedToast', {
            error:
              err instanceof Error ? err.message : t('common.unknownError'),
          }),
        )
      } finally {
        setImportBusy(false)
      }
    },
    [
      pluginManager,
      notifyPluginStateChange,
      saveStateMutation,
      applyNetworkConsent,
      t,
    ],
  )

  const handleImportFile = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await handleImportBytes(bytes, file.name)
    },
    [handleImportBytes],
  )

  // ── Configure dialog helpers ──────────────────────────────────────

  const statesMap = useMemo(() => {
    const map: Record<string, PluginStateResponse> = {}
    for (const s of statesQuery.data ?? []) {
      map[s.pluginId] = s
    }
    return map
  }, [statesQuery.data])

  const getConfigDraft = useCallback(
    (pluginId: string, manifest: PluginManifest): Record<string, unknown> => {
      if (configDrafts[pluginId]) return configDrafts[pluginId]
      const saved = statesMap[pluginId]?.config ?? {}
      const draft: Record<string, unknown> = {}
      for (const [key, field] of Object.entries(manifest.config)) {
        draft[key] =
          saved[key] ?? field.default ?? (field.type === 'boolean' ? false : '')
      }
      return draft
    },
    [configDrafts, statesMap],
  )

  const handleConfigChange = useCallback(
    (pluginId: string, key: string, value: unknown) => {
      setConfigDrafts((prev) => {
        const plugin = pluginManager
          .getInstalledPlugins()
          .find((p) => p.manifest.id === pluginId)
        if (!plugin) return prev
        return {
          ...prev,
          [pluginId]: {
            ...getConfigDraft(pluginId, plugin.manifest),
            [key]: value,
          },
        }
      })
    },
    [pluginManager, getConfigDraft],
  )

  const handleConfigToggle = useCallback(
    async (manifest: PluginManifest, checked: boolean) => {
      setBusyId(manifest.id)
      try {
        if (checked) {
          const config = getConfigDraft(manifest.id, manifest)
          await pluginManager.activatePlugin(
            manifest.id,
            buildActivationConfig(manifest.id, config),
          )
          setLedgerEnabled(manifest.id, true)
          setLedgerConfig(manifest.id, config)
          saveStateMutation.mutate({
            pluginId: manifest.id,
            enabled: true,
            config,
          })
        } else {
          await pluginManager.deactivatePlugin(manifest.id)
          setLedgerEnabled(manifest.id, false)
          saveStateMutation.mutate({
            pluginId: manifest.id,
            enabled: false,
            config: statesMap[manifest.id]?.config ?? {},
          })
        }
        notifyPluginStateChange()
      } catch {
        // silently ignore
      } finally {
        setBusyId(null)
      }
    },
    [
      pluginManager,
      notifyPluginStateChange,
      getConfigDraft,
      saveStateMutation,
      statesMap,
    ],
  )

  const handleConfigSubmit = useCallback(
    async (event: FormEvent, manifest: PluginManifest) => {
      event.preventDefault()
      setConfigFeedback((prev) => {
        const next = { ...prev }
        delete next[manifest.id]
        return next
      })
      setBusyId(manifest.id)
      try {
        const config = getConfigDraft(manifest.id, manifest)
        for (const [key, field] of Object.entries(manifest.config)) {
          if (field.required && !config[key]) {
            setConfigFeedback((prev) => ({
              ...prev,
              [manifest.id]: {
                type: 'error',
                message: t('pluginStore.fieldRequired', {
                  label: field.label,
                }),
              },
            }))
            setBusyId(null)
            return
          }
        }
        const isActive =
          pluginManager
            .getInstalledPlugins()
            .find((p) => p.manifest.id === manifest.id)?.status === 'active'
        if (isActive) await pluginManager.deactivatePlugin(manifest.id)
        await pluginManager.activatePlugin(
          manifest.id,
          buildActivationConfig(manifest.id, config),
        )
        setLedgerEnabled(manifest.id, true)
        setLedgerConfig(manifest.id, config)
        saveStateMutation.mutate({
          pluginId: manifest.id,
          enabled: true,
          config,
        })
        notifyPluginStateChange()
        setConfigFeedback((prev) => ({
          ...prev,
          [manifest.id]: {
            type: 'success',
            message: t('pluginStore.configSaved'),
          },
        }))
      } catch (err) {
        setConfigFeedback((prev) => ({
          ...prev,
          [manifest.id]: {
            type: 'error',
            message:
              err instanceof Error
                ? err.message
                : t('pluginStore.configurationFailed'),
          },
        }))
      } finally {
        setBusyId(null)
      }
    },
    [
      pluginManager,
      notifyPluginStateChange,
      getConfigDraft,
      saveStateMutation,
      t,
    ],
  )

  // Source per plugin (from the install ledger), recomputed on state changes.
  const sourceOf = useCallback(
    (pluginId: string): PluginSourceKind => {
      const ledger = getLedger()
      return ledger[pluginId]?.source ?? 'bootstrap'
    },
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
    [pluginStateVersion],
  )

  // Group by plugin family. User-provided plugins (imported folder / URL) keep
  // their own group ahead of family membership — where a plugin came from is
  // what the user is looking for there. Anything unfamilied (a third-party
  // plugin whose shape matches nothing) falls into the trailing group.
  const grouped = useMemo(() => {
    const byFamily = new Map<PluginFamilyId, Array<PluginInstance>>()
    const local: Array<PluginInstance> = []
    const other: Array<PluginInstance> = []

    for (const p of plugins) {
      const src = sourceOf(p.manifest.id)
      if (src === 'local' || src === 'url') {
        local.push(p)
        continue
      }
      const family = pluginFamilyOf(p.manifest)
      if (!family) {
        other.push(p)
        continue
      }
      const members = byFamily.get(family)
      if (members) members.push(p)
      else byFamily.set(family, [p])
    }

    return { byFamily, local, other }
  }, [plugins, sourceOf])

  const CORE_ID = 'pairlens-core'

  // Toggle handler that intercepts disabling the irreducible core plugin.
  const onToggleRow = useCallback(
    (plugin: PluginInstance, checked: boolean) => {
      if (!checked && plugin.manifest.id === CORE_ID) {
        setConfirmDisableCore(plugin.manifest.id)
        return
      }
      void handleToggle(plugin, checked)
    },
    [handleToggle],
  )

  // Family-level enable/disable. Required families carry no switch, so this
  // never reaches pairlens-core and never bypasses its confirm dialog (pinned
  // by lib/__tests__/plugin-families.test.ts). It is exactly the per-plugin
  // toggle applied to each member that needs it — no separate persistence.
  //
  // Order matters: see lib/plugins/family-toggle-order.ts. Every step of the
  // loop is a rendered state, and one of them would otherwise wipe the user's
  // theme selection.
  const [familyBusy, setFamilyBusy] = useState<PluginFamilyId | null>(null)
  const handleFamilyToggle = useCallback(
    async (
      family: PluginFamilyMeta,
      members: Array<PluginInstance>,
      checked: boolean,
    ) => {
      setFamilyBusy(family.id)
      let failed = 0
      try {
        const ordered = orderForBulkToggle(members, activeThemeId, checked)
        for (const plugin of ordered) {
          if ((plugin.status === 'active') === checked) continue
          if (!(await handleToggle(plugin, checked, true))) failed++
        }
      } finally {
        setFamilyBusy(null)
      }
      if (failed > 0) {
        toast.error(
          t('pluginStore.familyToggleFailed', { family: t(family.labelKey) }),
        )
      }
    },
    [handleToggle, activeThemeId, t],
  )

  return (
    <div
      className={cn(
        'mx-auto max-w-4xl p-6',
        dragOver && 'rounded-lg outline-2 outline-dashed outline-primary/60',
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = Array.from(e.dataTransfer.files).find((f) =>
          f.name.endsWith('.zip'),
        )
        if (file) void handleImportFile(file)
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleImportFile(file)
          e.target.value = ''
        }}
      />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {t('pluginStore.installed', 'Installed Plugins')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              'pluginStore.installedDescription',
              'Manage your installed plugins. Enable, disable, configure, or remove. Drop a .zip plugin here to import it.',
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={importBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            {importBusy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Upload className="size-3" />
            )}
            {t('pluginStore.importPlugin', 'Import plugin')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setManualInstallOpen(true)}
          >
            <Globe className="size-3" />
            {t('pluginStore.installFromUrl', 'Install from URL')}
          </Button>
          {isDesktop && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => void openLocalPluginsDir()}
            >
              <FolderOpen className="size-3" />
              {t('pluginStore.openFolder', 'Open folder')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground"
            disabled={busyId === '__reset__'}
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="size-3" />
            {t('pluginStore.resetToDefaults', 'Reset to defaults')}
          </Button>
        </div>
      </div>

      {/* Plugins that can't load sandboxed and need an explicit full-trust
          grant to run (e.g. installed before the sandbox model). */}
      {pendingTrust.length > 0 && (
        <div className="mb-4 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-500">
            <ShieldAlert className="size-4" />
            {t('pluginStore.needsFullTrustToRun')}
          </div>
          {pendingTrust.map((entry) => (
            <div
              key={entry.pluginId}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {entry.pluginId}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('pluginStore.pendingTrustDescription')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs text-amber-500 hover:text-amber-400"
                  disabled={busyId === entry.pluginId}
                  onClick={() => void handleGrantPendingTrust(entry)}
                >
                  <ShieldCheck className="size-3" />
                  {t('pluginStore.fullTrust.grant')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                  disabled={busyId === entry.pluginId}
                  onClick={() => {
                    removeFromLedger(entry.pluginId)
                    clearPendingFullTrust(entry.pluginId)
                    void moduleLoaderRef.current?.evict(entry.pluginId)
                    notifyPluginStateChange()
                  }}
                >
                  <Trash2 className="size-3" />
                  {t('pluginStore.remove')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Family groups, in declared order. pairlens-core is irreducible:
          disabled only through its confirm dialog, never removable. */}
      {PLUGIN_FAMILIES.map((family) => {
        const members = grouped.byFamily.get(family.id)
        if (!members || members.length === 0) return null
        const familyLabel = t(family.labelKey)
        return (
          <PluginGroup
            key={family.id}
            label={familyLabel}
            description={t(family.descriptionKey)}
            plugins={members}
            toggle={
              family.required
                ? undefined
                : {
                    // "On" while anything in the family still runs.
                    checked: members.some((p) => p.status === 'active'),
                    busy: familyBusy !== null,
                    ariaLabel: t('pluginStore.familyToggleAria', {
                      family: familyLabel,
                    }),
                    onCheckedChange: (checked) =>
                      void handleFamilyToggle(family, members, checked),
                  }
            }
          >
            {(plugin) => (
              <InstalledPluginRow
                key={plugin.manifest.id}
                plugin={plugin}
                source={sourceOf(plugin.manifest.id)}
                busy={busyId === plugin.manifest.id}
                panelCount={getContributedPanelCount(plugin)}
                update={availableUpdates.get(plugin.manifest.id)}
                onToggle={(checked) => onToggleRow(plugin, checked)}
                onConfigure={() => setConfigPlugin(plugin)}
                onRemove={() => setConfirmRemove(plugin.manifest.id)}
                onUpdate={handleUpdate}
                removable={plugin.manifest.id !== CORE_ID}
              />
            )}
          </PluginGroup>
        )
      })}

      {/* My Plugins — user-provided (local folder / imported / URL) */}
      {grouped.local.length > 0 && (
        <PluginGroup
          label={t('pluginStore.myPlugins', 'My Plugins')}
          plugins={grouped.local}
        >
          {(plugin) => (
            <InstalledPluginRow
              key={plugin.manifest.id}
              plugin={plugin}
              source={sourceOf(plugin.manifest.id)}
              busy={busyId === plugin.manifest.id}
              panelCount={getContributedPanelCount(plugin)}
              update={availableUpdates.get(plugin.manifest.id)}
              onToggle={(checked) => onToggleRow(plugin, checked)}
              onConfigure={() => setConfigPlugin(plugin)}
              onRemove={() => setConfirmRemove(plugin.manifest.id)}
              onUpdate={handleUpdate}
              removable
            />
          )}
        </PluginGroup>
      )}

      {/* Unfamilied plugins — nothing in the manifest places them. */}
      {grouped.other.length > 0 && (
        <PluginGroup
          label={t('pluginStore.groupProvidersExtensions')}
          plugins={grouped.other}
        >
          {(plugin) => (
            <InstalledPluginRow
              key={plugin.manifest.id}
              plugin={plugin}
              source={sourceOf(plugin.manifest.id)}
              busy={busyId === plugin.manifest.id}
              panelCount={getContributedPanelCount(plugin)}
              update={availableUpdates.get(plugin.manifest.id)}
              onToggle={(checked) => onToggleRow(plugin, checked)}
              onConfigure={() => setConfigPlugin(plugin)}
              onRemove={() => setConfirmRemove(plugin.manifest.id)}
              onUpdate={handleUpdate}
              removable
            />
          )}
        </PluginGroup>
      )}

      {plugins.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t('pluginStore.noInstalledPlugins', 'No plugins installed.')}
        </p>
      )}

      {/* Confirm remove dialog */}
      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('pluginStore.removePluginTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('pluginStore.removePluginDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemove && handleRemove(confirmRemove)}
            >
              {t('pluginStore.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm reset dialog */}
      <AlertDialog
        open={confirmReset}
        onOpenChange={(open) => {
          if (!open) setConfirmReset(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('pluginStore.resetDefaultsTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('pluginStore.resetDefaultsDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReset()}>
              {t('pluginStore.reset')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm disable core dialog */}
      <AlertDialog
        open={!!confirmDisableCore}
        onOpenChange={(open) => {
          if (!open) setConfirmDisableCore(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('pluginStore.disableCoreTitle', 'Disable the core platform?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'pluginStore.disableCoreDescription',
                'Pairlens Core provides the chart, order book, markets, and most built-in panels. Disabling it will hide those panels and leave the terminal nearly empty until you re-enable it. Continue?',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const plugin = pluginManager
                  .getInstalledPlugins()
                  .find((p) => p.manifest.id === confirmDisableCore)
                if (plugin) void handleToggle(plugin, false)
                setConfirmDisableCore(null)
              }}
            >
              {t('pluginStore.disableAnyway', 'Disable anyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual install dialog */}
      <Dialog
        open={manualInstallOpen}
        onOpenChange={(open) => {
          if (!open && !manualBusy) {
            setManualInstallOpen(false)
            setManualUrl('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('pluginStore.installFromUrlDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('pluginStore.installFromUrlDialogDescription')}
            </DialogDescription>
          </DialogHeader>

          {/* Security warning */}
          <div className="flex gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-300">
                {t('pluginStore.unverifiedPluginTitle')}
              </p>
              <p className="mt-0.5 text-amber-200/80">
                {t('pluginStore.unverifiedPluginBody')}
              </p>
            </div>
          </div>

          <Input
            type="url"
            placeholder="https://example.com/my-plugin.js"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            disabled={manualBusy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manualUrl.trim()) {
                void handleManualInstall()
              }
            }}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setManualInstallOpen(false)
                setManualUrl('')
              }}
              disabled={manualBusy}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="default"
              disabled={manualBusy || !manualUrl.trim()}
              onClick={() => void handleManualInstall()}
              className="gap-1.5"
            >
              {manualBusy && <Loader2 className="size-3.5 animate-spin" />}
              {manualBusy
                ? t('pluginStore.installing')
                : t('pluginStore.installAnyway')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure plugin dialog */}
      <PluginDetailDialog
        entry={configPlugin ? manifestToEntry(configPlugin.manifest) : null}
        open={!!configPlugin}
        onOpenChange={(open) => {
          if (!open) setConfigPlugin(null)
        }}
        active={configPlugin?.status === 'active'}
        busy={configPlugin ? busyId === configPlugin.manifest.id : false}
        feedback={
          configPlugin
            ? (configFeedback[configPlugin.manifest.id] ?? null)
            : null
        }
        savedConfig={
          configPlugin
            ? (statesMap[configPlugin.manifest.id]?.config ?? null)
            : null
        }
        configDraft={
          configPlugin
            ? getConfigDraft(configPlugin.manifest.id, configPlugin.manifest)
            : {}
        }
        onToggle={(checked) => {
          if (configPlugin)
            void handleConfigToggle(configPlugin.manifest, checked)
        }}
        onConfigChange={(key, value) => {
          if (configPlugin)
            handleConfigChange(configPlugin.manifest.id, key, value)
        }}
        onConfigSubmit={(e) => {
          if (configPlugin) void handleConfigSubmit(e, configPlugin.manifest)
        }}
      />

      {fullTrustDialog}
      {networkConsentDialog}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────

/** Header switch for a whole family — absent for groups that cannot be bulk-toggled. */
type GroupToggle = {
  checked: boolean
  busy: boolean
  ariaLabel: string
  onCheckedChange: (checked: boolean) => void
}

function PluginGroup({
  label,
  description,
  plugins,
  toggle,
  children,
}: {
  label: string
  description?: string
  plugins: Array<PluginInstance>
  toggle?: GroupToggle
  children: (plugin: PluginInstance) => React.ReactNode
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}{' '}
            <span className="text-muted-foreground/50">({plugins.length})</span>
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              {description}
            </p>
          )}
        </div>
        {toggle && (
          <Switch
            checked={toggle.checked}
            disabled={toggle.busy}
            onCheckedChange={toggle.onCheckedChange}
            aria-label={toggle.ariaLabel}
          />
        )}
      </div>
      <div className="space-y-1">{plugins.map(children)}</div>
    </section>
  )
}

function InstalledPluginRow({
  plugin,
  source,
  busy,
  panelCount,
  update,
  onToggle,
  onConfigure,
  onRemove,
  onUpdate,
  removable,
  toggleable = true,
}: {
  plugin: PluginInstance
  source: PluginSourceKind
  busy: boolean
  panelCount: number
  update?: PluginUpdateInfo
  onToggle: (checked: boolean) => void
  onConfigure: () => void
  onRemove: () => void
  onUpdate?: (update: PluginUpdateInfo) => void
  removable: boolean
  toggleable?: boolean
}) {
  const { t } = useTranslation()
  const SOURCE_LABELS: Record<PluginSourceKind, string> = {
    bootstrap: t('pluginStore.sourceBuiltIn'),
    registry: t('pluginStore.sourceRegistry'),
    url: t('pluginStore.sourceUrl'),
    local: t('pluginStore.sourceLocal'),
  }
  const hasConfig = Object.keys(plugin.manifest.config).length > 0
  const isActive = plugin.status === 'active'
  const configHint = isActive ? null : missingConfigHint(plugin.manifest)

  // Trust applies only to externally-loaded plugins (bootstrap plugins are
  // compiled in). Sandboxed is the default; full trust is an explicit grant.
  const isBootstrap = source === 'bootstrap'
  // UI-contributing plugins can ONLY run at full trust — never offer to
  // sandbox them (that would break them and leave no way back from this row).
  const requiresFullTrust = pluginRequiresFullTrust(plugin.manifest)
  const { requestFullTrust, dialog: rowTrustDialog } = useFullTrustConsent()
  const [trust, setTrust] = useState<PluginTrustLevel>(() =>
    getPluginTrust(plugin.manifest.id),
  )
  const applyTrust = (next: PluginTrustLevel) => {
    setPluginTrust(plugin.manifest.id, next)
    setTrust(next)
    toast.info(
      next === 'full'
        ? t('pluginStore.fullTrustGrantedRestartToast')
        : t('pluginStore.sandboxedRestartToast'),
      {
        action: {
          label: t('pluginStore.restartNow'),
          onClick: () => window.location.reload(),
        },
      },
    )
  }
  const onSetTrust = async (next: PluginTrustLevel) => {
    if (next === 'full') {
      const granted = await requestFullTrust({
        name: plugin.manifest.name,
        author: plugin.manifest.author,
      })
      if (!granted) return
    }
    applyTrust(next)
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/30">
      <PluginIcon
        src={plugin.manifest.icon}
        name={plugin.manifest.name}
        themeColors={plugin.manifest.theme?.previewColors}
        className="size-8"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {pluginTitle(plugin.manifest)}
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            v{plugin.manifest.version}
          </span>
          <Badge
            variant="outline"
            className="h-4 px-1 py-0 text-[9px] text-muted-foreground"
          >
            {SOURCE_LABELS[source]}
          </Badge>
          {!isBootstrap && (
            <Badge
              variant="outline"
              className={cn(
                'h-4 gap-1 px-1 py-0 text-[9px]',
                trust === 'full' ? 'text-amber-500' : 'text-muted-foreground',
              )}
              title={
                requiresFullTrust
                  ? t('pluginStore.requiresFullTrustTitle')
                  : undefined
              }
            >
              {trust === 'full' ? (
                <ShieldCheck className="size-2.5" />
              ) : (
                <Shield className="size-2.5" />
              )}
              {trust === 'full'
                ? requiresFullTrust
                  ? t('pluginStore.trustBadgeFullRequired')
                  : t('pluginStore.trustBadgeFull')
                : t('pluginStore.trustBadgeSandboxed')}
            </Badge>
          )}
          {update && (
            <Badge
              variant="secondary"
              className="h-4 gap-0.5 px-1 py-0 text-[9px] font-semibold text-primary"
            >
              <ArrowUpCircle className="size-2.5" />
              {update.latestVersion}
            </Badge>
          )}
          {panelCount > 0 && (
            <Badge variant="outline" className="h-4 gap-1 px-1 py-0 text-[9px]">
              <Puzzle className="size-2.5" />
              {t('pluginStore.panelCount', { count: panelCount })}
            </Badge>
          )}
          {configHint && (
            <Badge
              variant="outline"
              className="h-4 gap-1 border-amber-500/30 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-700 dark:text-amber-400"
            >
              <KeyRound className="size-2.5" />
              {configHint}
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {pluginDescription(plugin.manifest)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {update && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={busy}
            onClick={() => onUpdate?.(update)}
          >
            <ArrowUpCircle className="size-3" />
            {t('pluginStore.update')}
          </Button>
        )}
        {/* Trust toggle — only for plugins that CAN run sandboxed. UI plugins
            require full trust and must not be downgraded from this row. */}
        {!isBootstrap && !requiresFullTrust && (
          <Button
            size="icon-xs"
            variant="ghost"
            className={cn(
              'size-7 text-muted-foreground hover:text-foreground',
              trust === 'full' && 'text-amber-500 hover:text-amber-400',
            )}
            onClick={() =>
              void onSetTrust(trust === 'full' ? 'sandboxed' : 'full')
            }
            disabled={busy}
            aria-label={
              trust === 'full'
                ? t('pluginStore.revokeFullTrustAria', {
                    name: plugin.manifest.name,
                  })
                : t('pluginStore.grantFullTrustAria', {
                    name: plugin.manifest.name,
                  })
            }
            title={
              trust === 'full'
                ? t('pluginStore.fullTrustActiveTitle')
                : t('pluginStore.sandboxedTitle')
            }
          >
            {trust === 'full' ? (
              <ShieldCheck className="size-3.5" />
            ) : (
              <Shield className="size-3.5" />
            )}
          </Button>
        )}
        {rowTrustDialog}
        {hasConfig && (
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={onConfigure}
            disabled={busy}
            aria-label={t('pluginStore.configureAria', {
              name: plugin.manifest.name,
            })}
          >
            <Settings className="size-3.5" />
          </Button>
        )}
        {removable && (
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            disabled={busy}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
        <Switch
          checked={isActive}
          disabled={busy || !toggleable}
          onCheckedChange={onToggle}
          aria-label={t('pluginStore.toggleAria', {
            name: plugin.manifest.name,
          })}
        />
      </div>
    </div>
  )
}
